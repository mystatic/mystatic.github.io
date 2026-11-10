"""Record real SB3 PPO execution without changing its training implementation.

Run from anywhere: ../.venv/bin/python record_demo.py
Only files in this directory are written. The original checkpoint is never loaded.
"""
from __future__ import annotations

import ast
import hashlib
import importlib.metadata
import inspect
import json
import sys
from pathlib import Path

import gymnasium as gym
import numpy as np
import torch
from stable_baselines3 import PPO
from stable_baselines3.common.buffers import RolloutBuffer
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.env_util import make_vec_env

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from ppo_mujoco_minimal import ENV_ID, INITIAL_ANGLE, TenDegreeReset


def digest(model):
    return hashlib.sha256(b"".join(p.detach().cpu().numpy().tobytes() for p in model.policy.parameters())).hexdigest()


def physics(env):
    return [[*e.unwrapped.data.qpos, *e.unwrapped.data.qvel, e.unwrapped.data.time] for e in env.envs]


def plain(value):
    if isinstance(value, np.ndarray):
        return plain(value.tolist())
    if isinstance(value, (np.floating, float)):
        if not np.isfinite(value):
            raise ValueError("non-finite recorded data")
        return round(float(value), 8)
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, dict):
        return {k: plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(v) for v in value]
    return value


class IndexedBuffer(RolloutBuffer):
    def _get_samples(self, batch_inds, env=None):
        self.current_indices = batch_inds.copy()
        self.current_batch = super()._get_samples(batch_inds, env)
        return self.current_batch


class RecordingPPO(PPO):
    def train(self):
        run = self.recordings[-1]
        before_physics = physics(self.env)
        before_obs = self._last_obs.copy()
        before_hash = digest(self)
        original_evaluate = self.policy.evaluate_actions
        original_step = self.policy.optimizer.step
        batch_number = 0
        run["batches"] = []

        def evaluate(obs, actions):
            values, log_prob, entropy = original_evaluate(obs, actions)
            with torch.no_grad():
                batch = self.rollout_buffer.current_batch
                adv = batch.advantages
                norm_adv = (adv - adv.mean()) / (adv.std() + 1e-8)
                ratio = torch.exp(log_prob - batch.old_log_prob)
                unclipped = norm_adv * ratio
                clipped = norm_adv * torch.clamp(ratio, 0.8, 1.2)
                policy_loss = -torch.minimum(unclipped, clipped)
                value_loss = (batch.returns - values.flatten()) ** 2
                active_clip = clipped < unclipped
                rows = torch.stack((log_prob, values.flatten(), norm_adv, ratio, policy_loss, value_loss, active_clip.float()), dim=1).cpu().numpy()
                ids = []
                for flat_index, row in zip(self.rollout_buffer.current_indices, rows):
                    # SB3 flattens [time, env] in env-major order.
                    env_id, time_id = divmod(int(flat_index), self.n_steps)
                    sample_id = time_id * self.n_envs + env_id
                    ids.append(sample_id)
                    run["samples"][sample_id]["uses"].append([batch_number, *row])
                run["batches"].append({
                    "ids": ids,
                    "policy_loss": float(policy_loss.mean()),
                    "value_loss": float(value_loss.mean()),
                    "adv_mean": float(adv.mean()),
                    "adv_std": float(adv.std()),
                    "loss": float(policy_loss.mean() + self.vf_coef * value_loss.mean()),
                    "clip_fraction": float(((ratio - 1).abs() > 0.2).float().mean()),
                })
            return values, log_prob, entropy

        def step(*args, **kwargs):
            nonlocal batch_number
            result = original_step(*args, **kwargs)
            batch_number += 1
            return result

        self.policy.evaluate_actions = evaluate
        self.policy.optimizer.step = step
        try:
            super().train()  # Actual SB3 PPO; no copied optimization loop.
        finally:
            self.policy.evaluate_actions = original_evaluate
            self.policy.optimizer.step = original_step
        run["update_checks"] = {
            "optimizer_steps": batch_number,
            "physics_unchanged": bool(np.array_equal(before_physics, physics(self.env))),
            "observation_unchanged": bool(np.array_equal(before_obs, self._last_obs)),
            "parameters_changed": before_hash != digest(self),
            "hash_before": before_hash,
            "hash_after": digest(self),
        }
        assert all(run["update_checks"][k] for k in ("physics_unchanged", "observation_unchanged", "parameters_changed"))
        assert batch_number == 160
        print(f"rollout {len(self.recordings)}: 4096 samples, {batch_number} optimizer steps", flush=True)


class Recorder(BaseCallback):
    def _on_training_start(self):
        self.episode_ids = np.zeros(4, dtype=int)
        self.episode_steps = np.zeros(4, dtype=int)

    def _on_rollout_start(self):
        self.start_hash = digest(self.model)
        self.run = {"initial_obs": self.model._last_obs.copy(), "samples": [], "initial_physics": physics(self.training_env)}
        self.model.recordings.append(self.run)

    def _on_step(self):
        loc = self.locals
        obs = self.model._last_obs.copy()
        with torch.no_grad():
            distribution = self.model.policy.get_distribution(torch.as_tensor(obs, dtype=torch.float32)).distribution
            means = distribution.mean.cpu().numpy()
            stds = distribution.stddev.cpu().numpy()
        for e in range(4):
            done = bool(loc["dones"][e])
            info = loc["infos"][e]
            next_obs = info.get("terminal_observation", loc["new_obs"][e]).copy()
            self.run["samples"].append({
                "id": len(self.run["samples"]), "env": e,
                "t": int(loc["n_steps"]), "episode": int(self.episode_ids[e]),
                "episode_step": int(self.episode_steps[e]),
                "obs": obs[e], "next_obs": next_obs,
                "returned_obs": loc["new_obs"][e].copy(),
                "action": float(loc["actions"][e, 0]),
                "executed_action": float(loc["clipped_actions"][e, 0]),
                "mean": float(means[e, 0]), "std": float(stds[e, 0]),
                "reward": float(loc["rewards"][e]),
                "done": done, "truncated": bool(info.get("TimeLimit.truncated", False)),
                "episode_start": bool(self.model._last_episode_starts[e]),
                "old_value": float(loc["values"][e]),
                "old_log_prob": float(loc["log_probs"][e]), "uses": [],
            })
            self.episode_steps[e] += 1
            if done:
                self.episode_ids[e] += 1
                self.episode_steps[e] = 0
        return True

    def _on_rollout_end(self):
        buffer = self.model.rollout_buffer
        for s in self.run["samples"]:
            t, e = s["t"], s["env"]
            s["advantage"] = float(buffer.advantages[t, e])
            s["return"] = float(buffer.returns[t, e])
            s["buffer_reward"] = float(buffer.rewards[t, e])
        self.run["last_values"] = self.locals["values"].detach().cpu().numpy().reshape(-1)
        self.run["last_dones"] = self.locals["dones"].copy()
        self.run["last_obs"] = self.model._last_obs.copy()
        self.run["sampling_parameters_unchanged"] = self.start_hash == digest(self.model)
        assert self.run["sampling_parameters_unchanged"]


def main():
    torch.set_num_threads(1)
    source_path = ROOT / "ppo_mujoco_minimal.py"
    source = source_path.read_text()
    tree = ast.parse(source)
    train_fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "train")
    ppo_call = next(n for n in ast.walk(train_fn) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "PPO")
    config = {k.arg: ast.literal_eval(k.value) for k in ppo_call.keywords if k.arg not in ("env", "tensorboard_log", "verbose")}
    env = make_vec_env(ENV_ID, n_envs=4, seed=0, wrapper_class=TenDegreeReset)
    model = RecordingPPO(env=env, **config, seed=0, device="cpu", verbose=0, tensorboard_log=None, rollout_buffer_class=IndexedBuffer)
    model.recordings = []
    model.learn(total_timesteps=8192, callback=Recorder())

    # A real, explicitly modified TimeLimit fixture. Original training remains 1000 steps.
    fixture_env = make_vec_env(ENV_ID, n_envs=1, seed=7, wrapper_class=TenDegreeReset, env_kwargs={"max_episode_steps": 2})
    fixture_obs = fixture_env.reset()
    fixture = []
    for i in range(2):
        next_obs, reward, done, infos = fixture_env.step(np.zeros((1, 1), dtype=np.float32))
        terminal = infos[0].get("terminal_observation")
        with torch.no_grad():
            terminal_value = float(model.policy.predict_values(torch.as_tensor(terminal.reshape(1, -1), dtype=torch.float32))[0]) if terminal is not None else None
        fixture.append({"obs": fixture_obs[0].copy(), "next_obs": (terminal if terminal is not None else next_obs[0]).copy(),
                        "returned_obs": next_obs[0].copy(), "reward": float(reward[0]), "done": bool(done[0]),
                        "truncated": bool(infos[0].get("TimeLimit.truncated", False)), "terminal_value": terminal_value,
                        "buffer_reward": float(reward[0]) + model.gamma * terminal_value if terminal_value is not None else float(reward[0])})
        fixture_obs = next_obs.copy()
    assert fixture[-1]["truncated"] and fixture[-1]["done"]
    fixture_env.close()
    e = env.envs[0].unwrapped
    # A source snapshot makes the offline page self-contained and locates real lines.
    data = {"meta": {
        "versions": {p: importlib.metadata.version(p) for p in ("stable-baselines3", "gymnasium", "mujoco", "torch")},
        "source_sha256": hashlib.sha256(source.encode()).hexdigest(),
        "config": config, "seed": 0, "device": "cpu", "n_envs": 4, "n_epochs": model.n_epochs,
        "batch_size": model.batch_size, "vf_coef": model.vf_coef, "normalize_advantage": model.normalize_advantage,
        "frame_skip": e.frame_skip, "physics_dt": e.model.opt.timestep, "env_dt": e.dt,
        "episode_limit": env.envs[0].spec.max_episode_steps,
        "train_initial_angle_deg": [-10, 10], "train_initial_angle_distribution": "uniform",
        "eval_initial_angles_deg": [10, -10],
        "use_columns": ["batch_index", "new_log_prob", "new_value", "normalized_advantage", "ratio", "policy_loss", "value_squared_error", "active_clip"],
    }, "source": source, "rollouts": model.recordings, "timeout_fixture": fixture}
    env.close()
    output = HERE / "data.js"
    output.write_text("window.PPO_DATA = " + json.dumps(plain(data), ensure_ascii=False, separators=(",", ":"), allow_nan=False) + ";\n")
    print(f"Saved {output.name}: {output.stat().st_size / 1024 / 1024:.2f} MiB", flush=True)


if __name__ == "__main__":
    main()
