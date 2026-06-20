#!/usr/bin/env python3
"""
analyze_sla.py — SecureDrop SLA CDF Analysis

Usage:
  python3 analyze_sla.py [label:]file.csv ... [--output plot.png]

Example:
  python3 analyze_sla.py \
    "Gold (min-scale=1)":results/minscale1_clean.csv \
    "Silver (Cold)":results/cold_clean.csv \
    "Bronze (Concurrent)":results/concurrent_final.csv \
    "Other (Warm, no buffer)":results/warm_final.csv \
    --output results/sla_cdf_plot.png
"""

import csv, sys, os, statistics, argparse, math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker


# ── Data ─────────────────────────────────────────────────────────────────────

def read_latencies(filepath):
    latencies = []
    with open(filepath, newline='') as f:
        for row in csv.DictReader(f):
            try:
                latencies.append(float(row['latency_sec']))
            except (ValueError, KeyError):
                pass
    return sorted(latencies)


def pct(data, p):
    n = len(data)
    if n == 0: return float('nan')
    if n == 1: return data[0]
    k = (n - 1) * p / 100
    lo, hi = int(k), min(int(k) + 1, n - 1)
    return data[lo] + (k - lo) * (data[hi] - data[lo])


def compute_stats(latencies):
    if not latencies:
        return {}
    return {
        'count': len(latencies),
        'mean':  statistics.mean(latencies),
        'stdev': statistics.stdev(latencies) if len(latencies) > 1 else 0.0,
        'min':   latencies[0],
        'p50':   pct(latencies, 50),
        'p90':   pct(latencies, 90),
        'p95':   pct(latencies, 95),
        'p99':   pct(latencies, 99),
        'max':   latencies[-1],
    }


# ── Console output ────────────────────────────────────────────────────────────

def print_table(all_stats):
    W = 92
    print()
    print('=' * W)
    print('  SECUREDROP SLA MEASUREMENT SUMMARY')
    print('=' * W)
    print(f"  {'Scenario':<30} {'N':>4}  {'Mean':>7}  {'StDev':>7}  {'Min':>7}  "
          f"{'P50':>7}  {'P90':>7}  {'P95':>7}  {'P99':>7}  {'Max':>7}")
    print('-' * W)
    for label, s in all_stats.items():
        if not s: continue
        print(f"  {label:<30} {s['count']:>4}  "
              f"{s['mean']:>6.3f}s  {s['stdev']:>6.3f}s  {s['min']:>6.3f}s  "
              f"{s['p50']:>6.3f}s  {s['p90']:>6.3f}s  {s['p95']:>6.3f}s  "
              f"{s['p99']:>6.3f}s  {s['max']:>6.3f}s")
    print('=' * W)


def suggest_thresholds(all_stats):
    print()
    print('  SLA CLASS THRESHOLDS  (P99 rounded up to nearest 0.5s)')
    print('  ' + '-' * 65)
    sla_names = ['Gold', 'Silver', 'Bronze', 'Other']
    items = sorted(
        [(lbl, s) for lbl, s in all_stats.items() if s],
        key=lambda x: x[1].get('p99', float('inf'))
    )
    for i, (label, s) in enumerate(items):
        p99 = s['p99']
        threshold = math.ceil(p99 * 2) / 2
        cls = sla_names[min(i, len(sla_names) - 1)]
        print(f"  {cls:<7} [{label}]"
              f"   P99 = {p99:.3f}s   →   SLA target ≤ {threshold:.1f}s")
    print()


# ── CDF plot ──────────────────────────────────────────────────────────────────

COLORS  = ['#27ae60', '#c0392b', '#2980b9', '#d35400', '#8e44ad']
STYLES  = ['-',       '--',      '-.',       ':',       '-'      ]
MARKERS = ['o',       's',       '^',        'D',       'v'      ]


def plot_cdf(scenarios, output='sla_cdf_plot.png'):
    fig, ax = plt.subplots(figsize=(13, 7))

    x_max = 0.0
    box_lines = []

    # ── Draw each CDF ────────────────────────────────────────────────────────
    for i, (label, data) in enumerate(scenarios.items()):
        if not data:
            continue
        n     = len(data)
        color = COLORS[i % len(COLORS)]
        ls    = STYLES[i % len(STYLES)]
        mkr   = MARKERS[i % len(MARKERS)]

        cdf_y = [(j + 1) / n for j in range(n)]
        x_max = max(x_max, data[-1])

        # Step CDF line
        ax.step(data, cdf_y, where='post',
                color=color, linewidth=2.2, linestyle=ls,
                label=label, zorder=3)

        # Markers at P95 and P99
        for prob in (0.95, 0.99):
            val = pct(data, prob * 100)
            ax.plot(val, prob,
                    marker=mkr, color=color, markersize=10, zorder=5,
                    markeredgecolor='white', markeredgewidth=1.5)

        # Soft vertical dotted line at P99 for readability
        p99 = pct(data, 99)
        ax.axvline(x=p99, color=color, linestyle=':', linewidth=0.8,
                   alpha=0.35, zorder=1)

        # Collect for stats box
        p50 = pct(data, 50)
        p95 = pct(data, 95)
        box_lines.append((label, n, p50, p95, p99))

    # ── Horizontal reference lines ────────────────────────────────────────────
    for prob, lbl in [(0.95, '95%'), (0.99, '99%')]:
        ax.axhline(y=prob, color='gray', linestyle=':', linewidth=1.0,
                   alpha=0.55, zorder=1)
        ax.text(x_max * 1.115, prob, lbl,
                fontsize=9, color='gray', va='center', ha='right')

    # ── Stats box (center-right, clear of the Bronze rising edge) ───────────
    header = f"{'Scenario':<24} {'N':>3}  {'P50':>6}  {'P95':>6}  {'P99':>6}"
    sep    = '─' * len(header)
    rows   = [header, sep]
    for label, n, p50, p95, p99 in box_lines:
        short = label[:23]
        rows.append(f"{short:<24} {n:>3}  {p50:>5.1f}s  {p95:>5.1f}s  {p99:>5.1f}s")

    ax.text(0.965, 0.56, '\n'.join(rows),
            transform=ax.transAxes,
            fontsize=8.5,
            verticalalignment='center',
            horizontalalignment='right',
            fontfamily='monospace',
            bbox=dict(boxstyle='round,pad=0.5',
                      facecolor='white', alpha=0.92,
                      edgecolor='#bbbbbb'))

    # ── Axes & labels ─────────────────────────────────────────────────────────
    ax.set_xlabel('End-to-End Scan Latency (seconds)', fontsize=13, labelpad=10)
    ax.set_ylabel('Cumulative Probability',            fontsize=13, labelpad=10)
    ax.set_title(
        'SecureDrop Scanner — End-to-End Latency CDF\n'
        '(Upload accepted → AV scan complete → status: approved/rejected)',
        fontsize=13, fontweight='bold', pad=14
    )
    ax.set_ylim(0.0, 1.06)
    ax.set_xlim(left=0.0, right=x_max * 1.12)
    ax.yaxis.set_major_formatter(
        mticker.FuncFormatter(lambda y, _: f'{y:.0%}')
    )
    ax.legend(loc='lower right', fontsize=10,
              framealpha=0.92, edgecolor='#cccccc')
    ax.grid(True, alpha=0.22, zorder=0)

    plt.tight_layout()
    plt.savefig(output, dpi=160, bbox_inches='tight')
    print(f'\n✓ CDF plot saved: {os.path.abspath(output)}')
    plt.close()


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='SecureDrop SLA CDF Analysis')
    parser.add_argument('csvfiles', nargs='+',
                        help='CSV files — format: [label:]filename.csv')
    parser.add_argument('--output', default='sla_cdf_plot.png',
                        help='Output plot filename (default: sla_cdf_plot.png)')
    parser.add_argument('--no-plot', action='store_true',
                        help='Print statistics only, skip plot')
    args = parser.parse_args()

    scenarios  = {}
    all_stats  = {}

    for entry in args.csvfiles:
        if ':' in entry:
            label, filepath = entry.split(':', 1)
        else:
            label    = os.path.splitext(os.path.basename(entry))[0]
            filepath = entry

        if not os.path.exists(filepath):
            print(f'WARNING: File not found — {filepath}')
            continue

        data = read_latencies(filepath)
        if not data:
            print(f'WARNING: No valid latency data in {filepath}')
            continue

        scenarios[label] = data
        all_stats[label] = compute_stats(data)
        print(f'Loaded {len(data):>3} samples — \'{label}\'  (from {filepath})')

    if not scenarios:
        print('ERROR: No data loaded.')
        sys.exit(1)

    print_table(all_stats)
    suggest_thresholds(all_stats)

    if not args.no_plot:
        plot_cdf(scenarios, args.output)


if __name__ == '__main__':
    main()