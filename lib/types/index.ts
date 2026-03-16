// Core types for FPL Solver

export interface Player {
  id: number;
  code: number;
  first_name: string;
  second_name: string;
  web_name: string; // Display name
  team: number;
  team_code: number;
  element_type: number; // 1=GK, 2=DEF, 3=MID, 4=FWD
  
  // Pricing
  now_cost: number; // Price in tenths (e.g., 100 = £10.0m)
  cost_change_start: number;
  
  // Performance
  total_points: number;
  event_points: number; // Points in current gameweek
  points_per_game: number;
  form: string;
  
  // Stats
  selected_by_percent: string;
  transfers_in: number;
  transfers_out: number;
  transfers_in_event: number;
  transfers_out_event: number;
  
  // Status
  status: 'a' | 'd' | 'i' | 's' | 'u'; // available, doubtful, injured, suspended, unavailable
  chance_of_playing_this_round: number | null;
  chance_of_playing_next_round: number | null;
  
  // Additional stats
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  bonus: number;
  bps: number; // Bonus points system
  influence: string;
  creativity: string;
  threat: string;
  ict_index: string;
  
  minutes: number;
  saves: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  own_goals: number;
}

export interface Team {
  id: number;
  name: string;
  short_name: string;
  strength: number;
  strength_overall_home: number;
  strength_overall_away: number;
  strength_attack_home: number;
  strength_attack_away: number;
  strength_defence_home: number;
  strength_defence_away: number;
}

export interface Fixture {
  id: number;
  event: number; // Gameweek
  team_h: number; // Home team ID
  team_a: number; // Away team ID
  team_h_difficulty: number; // 1-5
  team_a_difficulty: number; // 1-5
  kickoff_time: string;
  finished: boolean;
  started: boolean;
  team_h_score: number | null;
  team_a_score: number | null;
}

export interface GameweekData {
  id: number;
  name: string;
  deadline_time: string;
  finished: boolean;
  is_current: boolean;
  is_next: boolean;
}

export interface UserTeam {
  players: Player[];
  budget: number;
  freeTransfers: number;
  teamValue: number;
}

export interface TransferSuggestion {
  playerOut: Player;
  playerIn: Player;
  cost: number; // Negative if saving money
  expectedPointsGain: number; // Over next N gameweeks
  reasoning: string;
  priority: 'high' | 'medium' | 'low';
}

export interface PlayerComparison {
  player1: Player;
  player2: Player;
  nextFixtures: Fixture[];
  formComparison: number;
  valueComparison: number;
  recommendation: 'player1' | 'player2' | 'neutral';
}

export interface PickInfo {
  playerId: number;
  position: number;      // 1-15 (1-11 = starters, 12-15 = bench)
  isCaptain: boolean;
  isViceCaptain: boolean;
  multiplier: number;    // 2 for captain, 1 otherwise
}

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface FilterOptions {
  position?: Position[];
  maxPrice?: number;
  minPrice?: number;
  teams?: number[];
  minForm?: number;
  status?: Player['status'][];
}
