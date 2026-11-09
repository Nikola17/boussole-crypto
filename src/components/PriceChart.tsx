// Graphique de prix en chandeliers (TradingView Lightweight Charts) : MM50/MM200, volume et RSI en panneaux séparés.

import { useEffect, useRef } from 'react';
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart,
  type IChartApi, type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '../lib/indicators';
import { rsi, sma } from '../lib/indicators';
import { priceDigits } from '../lib/format';

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

export interface ChartLevel {
  price: number;
  label: string;
  tone: 'up' | 'down' | 'neutral' | 'accent';
}

export function PriceChart({ candles, height = 420, levels = [], showRsi = true, themeKey }: {
  candles: Candle[];
  height?: number;
  levels?: ChartLevel[];
  showRsi?: boolean;
  themeKey?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!el.current || candles.length < 2) return;
    const text = cssVar('--text-muted');
    const line = cssVar('--line');
    const surface = cssVar('--surface-1');
    const up = cssVar('--up');
    const down = cssVar('--down');
    const chart = createChart(el.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: surface },
        textColor: text,
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontSize: 11,
        attributionLogo: false,
        panes: { separatorColor: line, separatorHoverColor: line },
      },
      grid: { vertLines: { color: line }, horzLines: { color: line } },
      rightPriceScale: { borderColor: line },
      timeScale: { borderColor: line, timeVisible: candles.length > 1 && candles[1].time - candles[0].time < 86400 },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { locale: 'fr-FR' },
    });
    chartRef.current = chart;
    const lastClose = candles[candles.length - 1].close;
    const digits = priceDigits(lastClose);
    const priceFormat = { type: 'price' as const, precision: digits, minMove: 1 / 10 ** digits };

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false, priceFormat,
    });
    candleSeries.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));

    const closes = candles.map((c) => c.close);
    const addMa = (period: number, color: string) => {
      const ma = sma(closes, period);
      const s = chart.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceFormat });
      s.setData(candles.map((c, i) => ({ time: c.time as UTCTimestamp, value: ma[i] })).filter((p) => Number.isFinite(p.value)));
    };
    if (candles.length > 50) addMa(50, cssVar('--series-4'));
    if (candles.length > 200) addMa(200, cssVar('--series-7'));

    for (const lv of levels) {
      if (!Number.isFinite(lv.price) || lv.price <= 0) continue;
      const color = lv.tone === 'up' ? up : lv.tone === 'down' ? down : lv.tone === 'accent' ? cssVar('--accent') : text;
      candleSeries.createPriceLine({ price: lv.price, color, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: lv.label });
    }

    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false }, 1);
    vol.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.volume, color: c.close >= c.open ? `${up}66` : `${down}66` })));

    if (showRsi && candles.length > 20) {
      const r = rsi(closes, 14);
      const rs = chart.addSeries(LineSeries, { color: cssVar('--accent'), lineWidth: 2, priceLineVisible: false, lastValueVisible: true, priceFormat: { type: 'price', precision: 0, minMove: 1 } }, 2);
      rs.setData(candles.map((c, i) => ({ time: c.time as UTCTimestamp, value: r[i] })).filter((p) => Number.isFinite(p.value)));
      rs.createPriceLine({ price: 70, color: down, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: '70' });
      rs.createPriceLine({ price: 30, color: up, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: '30' });
    }

    const panes = chart.panes();
    const total = height;
    if (panes[1]) panes[1].setHeight(Math.round(total * 0.16));
    if (panes[2]) panes[2].setHeight(Math.round(total * 0.2));

    const visible = Math.min(candles.length, 180);
    chart.timeScale().setVisibleLogicalRange({ from: candles.length - visible, to: candles.length + 2 });

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, levels, showRsi, height, themeKey]);

  return <div ref={el} style={{ height }} className="w-full overflow-hidden rounded-lg" />;
}
