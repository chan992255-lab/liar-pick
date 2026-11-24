import type { MafiaConfig, MafiaPlayer, MafiaRole } from '../../lib/types';
import { shuffle } from '../../lib/utils';

export function recommendedRoles(count: number): { mafia: number; police: number; doctor: number } {
  if (count <= 5) return { mafia: 1, police: 1, doctor: 1 };
  if (count <= 8) return { mafia: 2, police: 1, doctor: 1 };
  return { mafia: 3, police: 1, doctor: 1 };
}

export function assignRoles(config: MafiaConfig): MafiaPlayer[] {
  const roles: MafiaRole[] = [];
  for (let i = 0; i < config.mafia; i += 1) roles.push('mafia');
  for (let i = 0; i < config.police; i += 1) roles.push('police');
  for (let i = 0; i < config.doctor; i += 1) roles.push('doctor');
  while (roles.length < config.players.length) roles.push('citizen');
  const deck = shuffle(roles.slice(0, config.players.length));
  return config.players.map((player, index) => ({
    ...player,
    role: deck[index],
    alive: true,
  }));
}

export function alivePlayers(players: MafiaPlayer[]): MafiaPlayer[] {
  return players.filter((player) => player.alive);
}

export function countRole(players: MafiaPlayer[], role: MafiaRole): number {
  return players.filter((player) => player.alive && player.role === role).length;
}

export function checkWin(players: MafiaPlayer[]): 'mafia' | 'citizens' | null {
  const alive = alivePlayers(players);
  const mafia = alive.filter((player) => player.role === 'mafia').length;
  const others = alive.length - mafia;
  if (mafia === 0) return 'citizens';
  if (mafia >= others) return 'mafia';
  return null;
}

export type NightActions = {
  kills: Record<string, string>;
  protects: Record<string, string>;
  checks: Record<string, { target: string; isMafia: boolean }>;
};

export const emptyNight = (): NightActions => ({ kills: {}, protects: {}, checks: {} });

/** 마피아 지목 집계 — 최다 득표, 동률이면 그중 무작위 */
export function resolveKill(actions: NightActions): string | null {
  const counts: Record<string, number> = {};
  Object.values(actions.kills).forEach((target) => {
    counts[target] = (counts[target] ?? 0) + 1;
  });
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  const max = Math.max(...entries.map(([, value]) => value));
  const top = entries.filter(([, value]) => value === max).map(([id]) => id);
  return top[Math.floor(Math.random() * top.length)];
}

export function roleCountLabel(mafia: number, police: number, doctor: number): string {
  return `마피아 ${mafia} · 경찰 ${police} · 의사 ${doctor}`;
}
