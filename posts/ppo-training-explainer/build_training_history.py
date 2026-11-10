"""Export existing Monitor logs as offline training curves; never retrain a model.

The four synchronous environments each step once per vector call. Their cumulative
completed episode lengths therefore locate episode ends on the total-step axis.
Reconstructed last-100 means must match all recorded rollout summaries exactly.
"""
from __future__ import annotations
import argparse
import bisect
import csv
import hashlib
import json
import statistics
from pathlib import Path

HERE = Path(__file__).resolve().parent

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def build(run):
    manifest = json.loads((run/'manifest.json').read_text())
    progress = json.loads((run/'progress.json').read_text())
    n_envs, total, cap = manifest['n_envs'], manifest['actual_steps'], manifest['max_episode_steps']
    sources, episodes, per_env = {}, [], []
    for env in range(n_envs):
        path = run/'monitor'/f'{env}.monitor.csv'
        sources[str(path.relative_to(run))] = sha(path)
        with path.open() as f:
            header = json.loads(f.readline().removeprefix('#'))
            rows = list(csv.DictReader(f))
        assert header['env_id'] == manifest['env_id']
        cumulative = 0
        for i,row in enumerate(rows):
            length, reward = int(row['l']), float(row['r'])
            assert 0 < length <= cap and reward in (length, length-1)
            cumulative += length
            assert cumulative*n_envs <= total
            episodes.append({'env':env, 'episode':i+1, 'end_step':cumulative*n_envs,
                             'length':length, 'reward_sum':reward,
                             'reached_limit':length==cap and reward==cap})
        per_env.append({'env':env, 'completed_episodes':len(rows), 'completed_env_steps':cumulative,
                        'unfinished_env_steps':total//n_envs-cumulative})
    # SB3 receives same-vector-step episode infos in environment index order.
    episodes.sort(key=lambda e:(e['end_step'],e['env']))
    for i,e in enumerate(episodes):
        recent = episodes[max(0,i-99):i+1]
        e.update({'index':i, 'window_count':len(recent),
                  'mean_length_100':statistics.mean(x['length'] for x in recent),
                  'mean_reward_100':statistics.mean(x['reward_sum'] for x in recent),
                  'full_count_100':sum(x['reached_limit'] for x in recent)})
    steps=[e['end_step'] for e in episodes]
    rollouts=[]
    for r in progress['rollouts']:
        i=bisect.bisect_right(steps,r['steps'])-1
        e=episodes[i]
        assert abs(e['mean_length_100']-r['recent_episode_steps_mean'])<1e-9
        assert abs(e['mean_reward_100']-r['recent_episode_reward_mean'])<1e-9
        rollouts.append({**r,'last_episode_index':i})
    first_mean = next(e for e in episodes if e['window_count']==100 and e['mean_length_100']>=100)
    first_full = next(e for e in episodes if e['reached_limit'])
    last_short = next(e for e in reversed(episodes) if not e['reached_limit'])
    first_all_full = next(e for e in episodes if e['window_count']==100 and e['full_count_100']==100)
    milestones = [{'id':'mean100','label':'平均长度首次超过 100 步','episode_index':first_mean['index']},
                  {'id':'first_full','label':'首次跑满 1000 步','episode_index':first_full['index']},
                  {'id':'last_short','label':'最后一个未跑满的回合','episode_index':last_short['index']},
                  {'id':'full100','label':'最近 100 回合全部跑满','episode_index':first_all_full['index']}]
    sources['progress.json']=sha(run/'progress.json')
    sources['manifest.json']=sha(run/'manifest.json')
    data={'meta':{'source_sha256':sources, 'training_source_sha256':manifest['source_sha256'],
                  'original_model_sha256':manifest['original_model_sha256_before'],
                  'before_model_sha256':manifest['before_model_sha256'], 'after_model_sha256':manifest['after_model_sha256'],
                  'n_envs':n_envs, 'actual_steps':total, 'episode_limit':cap,
                  'env_step_seconds':manifest['step_seconds'], 'train_seed':manifest['train_seed'],
                  'action_mode':'stochastic', 'initial_angle_deg':manifest['train_initial_angle_deg'],
                  'default_window':100, 'completed_episodes':len(episodes),
                  'unfinished_env_steps':sum(x['unfinished_env_steps'] for x in per_env),
                  'rollout_means_verified':len(rollouts), 'per_env':per_env,
                  'axis_method':'n_envs * cumulative completed episode lengths per synchronous environment; ties sorted by env index'},
          'episodes':episodes,'rollouts':rollouts,'milestones':milestones,
          'summary':{'first_rollout_mean_length':rollouts[0]['recent_episode_steps_mean'],
                     'first_rollout_mean_reward':rollouts[0]['recent_episode_reward_mean'],
                     'full_episodes_after_last_short':len(episodes)-last_short['index']-1,
                     'total_full_episodes':sum(x['reached_limit'] for x in episodes)}}
    (run/'training-history.json').write_text(json.dumps(data,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
    (run/'training-history.js').write_text('window.PPO_TRAINING_HISTORY = '+json.dumps(data,ensure_ascii=False,separators=(',',':'),allow_nan=False)+';\n')
    print(json.dumps({'completed_episodes':len(episodes),'rollout_means_verified':len(rollouts),
                      'unfinished_env_steps':data['meta']['unfinished_env_steps'],
                      'milestones':[{**m,'end_step':episodes[m['episode_index']]['end_step']} for m in milestones]},ensure_ascii=False))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--run',type=Path,default=HERE/'comparison-run-seed0')
    build(p.parse_args().run)
