"""Train a separate before/after pair and export deterministic, paired evaluations.

Run from RL: ./.venv/bin/python -B ppo-training-explainer/train_comparison.py
The output directory must not exist. The original model is only hashed, never loaded.
"""
from __future__ import annotations
import argparse
import ast
import hashlib
import importlib.metadata
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.env_util import make_vec_env

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from ppo_mujoco_minimal import ENV_ID, TenDegreeReset, make_env


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def policy_sha(model):
    return hashlib.sha256(b''.join(p.detach().cpu().numpy().tobytes() for p in model.policy.parameters())).hexdigest()


def write_json(path, obj):
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    tmp.replace(path)


def evaluate(model, angle, seed):
    env = make_env()
    try:
        obs, _ = env.reset(seed=seed, options={'initial_angle': np.deg2rad(angle)})
        states, actions, rewards = [obs.tolist()], [], []
        while True:
            action, _ = model.predict(obs, deterministic=True)
            obs, reward, terminated, truncated, _ = env.step(action)
            states.append(obs.tolist())
            actions.append(np.asarray(action).tolist())
            rewards.append(float(reward))
            if terminated or truncated:
                break
        return {'states': states, 'actions': actions, 'rewards': rewards,
                'steps': len(rewards), 'seconds': len(rewards) * env.unwrapped.dt,
                'reward_sum': sum(rewards), 'terminated': bool(terminated), 'truncated': bool(truncated),
                'reached_limit': bool(truncated and not terminated and len(rewards) == 1000)}
    finally:
        env.close()


class Progress(BaseCallback):
    def __init__(self, out):
        super().__init__()
        self.out, self.start, self.rows = out, time.monotonic(), []

    def _on_step(self):
        return True

    def _on_rollout_end(self):
        row = {'rollout': len(self.rows)+1, 'steps': self.num_timesteps,
               'elapsed_seconds': round(time.monotonic()-self.start, 2)}
        if self.model.ep_info_buffer:
            row['recent_episode_steps_mean'] = float(np.mean([x['l'] for x in self.model.ep_info_buffer]))
            row['recent_episode_reward_mean'] = float(np.mean([x['r'] for x in self.model.ep_info_buffer]))
        self.rows.append(row)
        write_json(self.out/'progress.json', {'status': 'training', 'latest': row, 'rollouts': self.rows})
        if len(self.rows) % 5 == 0 or len(self.rows) == 1:
            print(json.dumps(row), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=HERE/'comparison-run-seed0')
    args = parser.parse_args()
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=False)
    original = ROOT/'ppo_inverted_pendulum.zip'
    original_hash = sha(original)
    source_path = ROOT/'ppo_mujoco_minimal.py'
    source = source_path.read_text()
    tree = ast.parse(source)
    train_fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'train')
    call = next(n for n in ast.walk(train_fn) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == 'PPO')
    config = {k.arg: ast.literal_eval(k.value) for k in call.keywords if k.arg not in ('env','verbose','tensorboard_log')}
    torch.set_num_threads(1)
    seed, budget = 0, 300_000
    manifest = {'started_utc': datetime.now(timezone.utc).isoformat(), 'original_model_sha256_before': original_hash,
                'source_sha256': sha(source_path), 'config': config, 'train_seed': seed, 'device': 'cpu',
                'torch_threads': 1, 'n_envs': 4, 'requested_steps': budget,
                'train_initial_angle_deg': [-10,10], 'train_angle_distribution': 'uniform',
                'test_angles_deg': [10,-10], 'test_seeds': list(range(1,11)), 'deterministic': True,
                'env_id': ENV_ID, 'step_seconds': .04, 'max_episode_steps': 1000,
                'versions': {p: importlib.metadata.version(p) for p in ('stable-baselines3','gymnasium','mujoco','torch')}}
    (out/'training-source.py').write_text(source)
    write_json(out/'manifest.json', manifest)
    env = make_vec_env(ENV_ID, n_envs=4, seed=seed, wrapper_class=TenDegreeReset, monitor_dir=str(out/'monitor'))
    progress = Progress(out)
    try:
        model = PPO(env=env, **config, seed=seed, device='cpu', verbose=0, tensorboard_log=None)
        model.save(out/'before')
        manifest['before_policy_sha256'] = policy_sha(model)
        print('Saved untrained model; starting separate 300000-step training.', flush=True)
        start = time.monotonic()
        model.learn(total_timesteps=budget, callback=progress, progress_bar=False)
        manifest['training_seconds'] = round(time.monotonic()-start, 3)
        model.save(out/'after')
        manifest['actual_steps'] = model.num_timesteps
        manifest['n_epochs'] = model.n_epochs
        manifest['rollouts'] = len(progress.rows)
        manifest['optimizer_steps'] = len(progress.rows)*model.n_epochs*(model.n_steps*model.n_envs//model.batch_size)
        manifest['after_policy_sha256'] = policy_sha(model)
    finally:
        env.close()
    # Evaluate saved snapshots only after training, so evaluation never changes training RNG/state.
    before, after = PPO.load(out/'before', device='cpu'), PPO.load(out/'after', device='cpu')
    hashes = [policy_sha(before), policy_sha(after)]
    pairs = []
    for angle in manifest['test_angles_deg']:
        for test_seed in manifest['test_seeds']:
            pair = {'angle_deg': angle, 'seed': test_seed,
                    'before': evaluate(before, angle, test_seed), 'after': evaluate(after, angle, test_seed)}
            assert np.array_equal(pair['before']['states'][0], pair['after']['states'][0])
            pairs.append(pair)
        print(json.dumps({'angle_deg':angle,'before_steps':[p['before']['steps'] for p in pairs if p['angle_deg']==angle],
                          'after_steps':[p['after']['steps'] for p in pairs if p['angle_deg']==angle]}), flush=True)
    assert hashes == [policy_sha(before), policy_sha(after)]
    assert sha(original) == original_hash, 'Original checkpoint changed during run'
    assert sha(source_path) == manifest['source_sha256'], 'Training source changed during run'
    manifest.update({'original_model_sha256_after': sha(original), 'original_model_preserved': True,
                     'before_model_sha256': sha(out/'before.zip'), 'after_model_sha256': sha(out/'after.zip'),
                     'evaluation_did_not_update_parameters': True, 'finished_utc':datetime.now(timezone.utc).isoformat()})
    summaries=[]
    for angle in manifest['test_angles_deg']:
        for label in ('before','after'):
            episodes=[p[label] for p in pairs if p['angle_deg']==angle]
            summaries.append({'angle_deg': angle, 'model': label, 'episodes': len(episodes),
                              'mean_steps':float(np.mean([e['steps'] for e in episodes])),
                              'mean_seconds':float(np.mean([e['seconds'] for e in episodes])),
                              'mean_reward_sum':float(np.mean([e['reward_sum'] for e in episodes])),
                              'reached_limit_count':sum(e['reached_limit'] for e in episodes)})
    payload={'meta':manifest,'pairs':pairs,'summary':summaries}
    write_json(out/'manifest.json',manifest)
    write_json(out/'evaluation.json',payload)
    (out/'evaluation.js').write_text('window.PPO_EVALUATION = '+json.dumps(payload,ensure_ascii=False,separators=(',',':'),allow_nan=False)+';\n')
    write_json(out/'progress.json',{'status':'complete','actual_steps':manifest['actual_steps'],'summary':summaries,'rollouts':progress.rows})
    print(json.dumps({'status':'complete','actual_steps':manifest['actual_steps'],'training_seconds':manifest['training_seconds'],'summary':summaries,'output':str(out)},ensure_ascii=False),flush=True)


if __name__ == '__main__':
    main()
