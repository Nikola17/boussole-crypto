// Registre des stratégies du Labo et empreinte de leurs règles : changer une règle (version de la stratégie,
// des signaux, de la température ou du panier) change l'empreinte, et l'autopilote concerné repart de zéro.

import { SIGNALS_VERSION } from '../../signals';
import { CYCLE_VERSION } from '../../cycle';
import { AUTO_BASKET_VERSION } from '../../autoBasket';
import type { ParamValue, Strategy } from '../types';
import { dcaBtc } from './dcaBtc';
import { investisseur } from './investisseur';

export const STRATEGIES: Record<string, Strategy<Record<string, ParamValue>>> = {
  [dcaBtc.id]: dcaBtc as unknown as Strategy<Record<string, ParamValue>>,
  [investisseur.id]: investisseur as unknown as Strategy<Record<string, ParamValue>>,
};

const COMPONENT_VERSION = { signals: SIGNALS_VERSION, cycle: CYCLE_VERSION, autoBasket: AUTO_BASKET_VERSION } as const;

export function rulesFingerprint(s: Pick<Strategy, 'id' | 'version' | 'uses'>): string {
  return [`${s.id}@${s.version}`, ...s.uses.map((u) => `${u}${COMPONENT_VERSION[u]}`)].join('+');
}
