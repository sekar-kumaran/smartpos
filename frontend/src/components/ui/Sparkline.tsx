/**
 * SmartPOS AI – Sparkline & AreaChart
 * SVG-based charts — web-first (react-native-web renders these natively in the browser DOM).
 */

import React from 'react';
import {View} from 'react-native';

// ─── Path helpers ─────────────────────────────────────────────────────────────

function normalize(data: number[], h: number, pad: number): [number, number][] {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const n = data.length;
  return data.map((v, i) => [
    pad + (i / (n - 1)) * (100 - pad * 2),   // x percent — use viewBox 0-100
    pad + (1 - (v - min) / range) * (h - pad * 2),
  ]);
}

function curvePath(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], c = pts[i];
    const mx = (p[0] + c[0]) / 2;
    d += ` C ${mx},${p[1]} ${mx},${c[1]} ${c[0]},${c[1]}`;
  }
  return d;
}

// ─── Sparkline (mini KPI card chart) ─────────────────────────────────────────

interface SparklineProps {
  data:    number[];
  color:   string;
  width?:  number;
  height?: number;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  color,
  width  = 72,
  height = 30,
}) => {
  if (!data || data.length < 2) return null;
  const pts  = normalize(data, height, 3);
  const line = curvePath(pts);

  return (
    <View style={{width, height}}>
      {/* @ts-ignore — SVG works natively in react-native-web DOM */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        style={{overflow: 'visible'}}>
        {/* @ts-ignore */}
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </View>
  );
};

// ─── AreaChart (full Sales Overview chart) ────────────────────────────────────

export interface AreaChartPoint {
  label:   string;
  value:   number;
  tooltip?: string;
}

interface AreaChartProps {
  data:       AreaChartPoint[];
  color:      string;
  width?:     number;
  height?:    number;
  showLabels?: boolean;
}

export const AreaChart: React.FC<AreaChartProps> = ({
  data,
  color,
  width  = 320,
  height = 120,
  showLabels = false,
}) => {
  if (!data || data.length < 2) return null;

  const values = data.map(d => d.value);
  const max    = Math.max(...values);
  const min    = Math.min(...values);
  const range  = max - min || 1;
  const padTop = 8, padBot = showLabels ? 20 : 4, padSide = 4;
  const w = 100, h = height;

  const pts: [number, number][] = values.map((v, i) => [
    padSide + (i / (data.length - 1)) * (w - padSide * 2),
    padTop + (1 - (v - min) / range) * (h - padTop - padBot),
  ]);

  const line  = curvePath(pts);
  const area  = `${line} L ${pts[pts.length - 1][0]},${h - padBot} L ${pts[0][0]},${h - padBot} Z`;
  const gId   = `area-${color.replace('#', '').slice(0, 6)}`;

  // Find peak point
  const peakIdx  = values.indexOf(Math.max(...values));
  const peakPt   = pts[peakIdx];
  const peakVal  = data[peakIdx];

  return (
    <View style={{width, height}}>
      {/* @ts-ignore */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{overflow: 'visible', width, height}}>
        {/* @ts-ignore */}
        <defs>
          {/* @ts-ignore */}
          <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
            {/* @ts-ignore */}
            <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
            {/* @ts-ignore */}
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Area fill */}
        {/* @ts-ignore */}
        <path d={area} fill={`url(#${gId})`} />
        {/* Line */}
        {/* @ts-ignore */}
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Data point dots */}
        {pts.map(([x, y], i) => (
          // @ts-ignore
          <circle
            key={i}
            cx={x}
            cy={y}
            r={i === peakIdx ? 3.5 : 2.5}
            fill={i === peakIdx ? color : '#fff'}
            stroke={color}
            strokeWidth={i === peakIdx ? 0 : 1.8}
          />
        ))}
        {/* Peak label */}
        {peakVal && (
          <>
            {/* @ts-ignore */}
            <rect
              x={peakPt[0] - 16}
              y={peakPt[1] - 18}
              width={32}
              height={14}
              rx={4}
              fill={color}
            />
            {/* @ts-ignore */}
            <text
              x={peakPt[0]}
              y={peakPt[1] - 8}
              textAnchor="middle"
              fontSize="6"
              fontWeight="700"
              fill="white">
              {peakVal.tooltip || peakVal.label}
            </text>
          </>
        )}
        {/* X-axis labels */}
        {showLabels && pts.map(([x], i) => (
          // @ts-ignore
          <text
            key={i}
            x={x}
            y={h - 4}
            textAnchor="middle"
            fontSize="5.5"
            fill="#9B9BBF"
            fontWeight="500">
            {data[i].label}
          </text>
        ))}
      </svg>
    </View>
  );
};
