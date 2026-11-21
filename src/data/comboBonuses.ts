/**
 * Named move sequences ("signature combos"). When the last moves of a combo
 * match a sequence, the bonus is added to the combo pool (and therefore multiplied).
 */
export interface NamedCombo {
  id: string;
  name: string;
  sequence: string[];
  bonus: number;
}

export const NAMED_COMBOS: NamedCombo[] = [
  { id: 'basement_classic', name: 'BASEMENT CLASSIC', sequence: ['two_step', 'forward_arms', 'spinkick'], bonus: 400 },
  { id: 'spare_change', name: 'SPARE CHANGE', sequence: ['forward_arms', 'side_arms', 'pick_up_change'], bonus: 600 },
  { id: 'clear_the_floor', name: 'CLEAR THE FLOOR', sequence: ['crowd_push', 'spinkick', 'floorwork'], bonus: 700 },
  { id: 'gym_class_hero', name: 'GYM CLASS HERO', sequence: ['cartwheel', 'floorwork', 'butterfly_kick'], bonus: 1200 },
  { id: 'pit_ninja', name: 'PIT NINJA', sequence: ['spinkick', 'tornado_kick', 'butterfly_kick'], bonus: 1500 },
  {
    id: 'hardcore_history',
    name: 'HARDCORE HISTORY',
    sequence: ['two_step', 'forward_arms', 'spinkick', 'butterfly_kick', 'cartwheel', 'two_step'],
    bonus: 3000,
  },
];
