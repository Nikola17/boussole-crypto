// Registre des stratégies du Labo et empreinte de leurs règles : changer une règle (version de la stratégie,
// des signaux, de la température, du panier ou du régime) change l'empreinte, et l'autopilote concerné repart de zéro.

import { SIGNALS_VERSION } from '../../signals';
import { CYCLE_VERSION } from '../../cycle';
import { AUTO_BASKET_VERSION } from '../../autoBasket';
import { REGIME_VERSION } from '../regime';
import type { ParamValue, Strategy } from '../types';
import { dcaBtc } from './dcaBtc';
import { investisseur } from './investisseur';
import { dcaBoussole } from './dcaBoussole';
import { trader } from './trader';
import { meanReversion } from './meanReversion';
import { rotationMomentum } from './rotationMomentum';
import { trendDonchian } from './trendDonchian';
import { swing4h } from './swing4h';
import { gridAuto } from './gridAuto';
import { fundingContrarian } from './fundingContrarian';
import { pairsArb } from './pairsArb';
import { metaAllocator } from './metaAllocator';
import { smartShadow } from './smartShadow';
import { catalystEvent } from './catalystEvent';

export const STRATEGIES: Record<string, Strategy<Record<string, ParamValue>>> = {
  [metaAllocator.id]: metaAllocator as unknown as Strategy<Record<string, ParamValue>>,
  [dcaBtc.id]: dcaBtc as unknown as Strategy<Record<string, ParamValue>>,
  [investisseur.id]: investisseur as unknown as Strategy<Record<string, ParamValue>>,
  [dcaBoussole.id]: dcaBoussole as unknown as Strategy<Record<string, ParamValue>>,
  [trader.id]: trader as unknown as Strategy<Record<string, ParamValue>>,
  [meanReversion.id]: meanReversion as unknown as Strategy<Record<string, ParamValue>>,
  [rotationMomentum.id]: rotationMomentum as unknown as Strategy<Record<string, ParamValue>>,
  [trendDonchian.id]: trendDonchian as unknown as Strategy<Record<string, ParamValue>>,
  [swing4h.id]: swing4h as unknown as Strategy<Record<string, ParamValue>>,
  [gridAuto.id]: gridAuto as unknown as Strategy<Record<string, ParamValue>>,
  [fundingContrarian.id]: fundingContrarian as unknown as Strategy<Record<string, ParamValue>>,
  [pairsArb.id]: pairsArb as unknown as Strategy<Record<string, ParamValue>>,
  [smartShadow.id]: smartShadow as unknown as Strategy<Record<string, ParamValue>>,
  [catalystEvent.id]: catalystEvent as unknown as Strategy<Record<string, ParamValue>>,
};

const COMPONENT_VERSION = { signals: SIGNALS_VERSION, cycle: CYCLE_VERSION, autoBasket: AUTO_BASKET_VERSION, regime: REGIME_VERSION } as const;

export function rulesFingerprint(s: Pick<Strategy, 'id' | 'version' | 'uses'>): string {
  return [`${s.id}@${s.version}`, ...s.uses.map((u) => `${u}${COMPONENT_VERSION[u]}`)].join('+');
}
