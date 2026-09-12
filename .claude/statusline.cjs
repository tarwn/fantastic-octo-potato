#!/usr/bin/env node
// Claude Code Statusline
//modified from https://gist.github.com/mdelally/ff71c4ef29d17e8c5e2e474355877d1b

const fs = require('fs');
const path = require('path');
const os = require('os');

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const model = data.model?.display_name || 'Claude';
    const effort = data.effort?.level || '???';
    const dir = data.workspace?.current_dir || process.cwd();
    const session = data.session_id || '';
    const remaining = data.context_window?.remaining_percentage;

    // ── Session token totals ─────────────────────────────────────────────────
    let tokenStr = '';
    const totalIn = data.context_window?.total_input_tokens;
    const totalOut = data.context_window?.total_output_tokens;
    if (totalIn != null || totalOut != null) {
      const formatK = n => {
        if (n == null) return '?';
        if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
        if (n >= 1000) return `${Math.round(n / 1000)}k`;
        return String(n);
      };

      // my preferences for token usage
      const INPUT_TOKE_WARN = 5;
      const INPUT_TOKE_ESCALATE = 10;
      const INPUT_TOKE_ALERT = 20;

      const inputUsed = Math.max(0, Math.min(100, Math.round(100 - (remaining ?? 100))));

      // colors for input
      let color = "\x1b[2m";
      if (inputUsed < INPUT_TOKE_WARN) {
        color = `\x1b[32m`;
      } else if (inputUsed < INPUT_TOKE_ESCALATE) {
        color = `\x1b[33m`;
      } else if (inputUsed < INPUT_TOKE_ALERT) {
        color = `\x1b[38;5;208m`;
      } else {
        color = `\x1b[5;31m💀 `;
      }

      tokenStr = `${color}${("    " + formatK(totalIn)).slice(-4)} in\x1b[0m${("    " + formatK(totalOut)).slice(-4)} out\x1b[0m`;
    }

    // ── Subscription usage (rate limits) ────────────────────────────────────
    let subStr = '';
    const fiveHour = data.rate_limits?.five_hour;
    const sevenDay = data.rate_limits?.seven_day;

    const buildSubBar = (pct) => {
      const filled = Math.floor(pct / 10);
      let color = pct < 60 ? '\x1b[32m' : pct < 85 ? '\x1b[33m' : '\x1b[31m';
      const bar = color + '▰'.repeat(filled) + "\x1b[0m" + '▱'.repeat(10 - filled);
      return `${bar} ${color}${pct}%\x1b[0m`;
    };

    const parseTimestamp = (val) => {
      if (!val) return null;
      let ts = val;
      if (typeof val === 'string') {
        ts = isNaN(val) ? new Date(val).getTime() : parseInt(val);
      }
      if (ts < 1577836800000) {
        ts = ts * 1000;
      }
      return new Date(ts);
    };

    const formatTimeET = (val) => {
      const date = parseTimestamp(val);
      if (!date || isNaN(date.getTime())) return '';
      return date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }).replace(/\s+/g, '');
    };

    const formatDateTimeET = (val) => {
      const date = parseTimestamp(val);
      if (!date || isNaN(date.getTime())) return '';
      return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }).replace(/,\s*/g, ' ');
    };

    if (fiveHour != null) {
      const pct = Math.round(fiveHour.used_percentage);
      const fiveEnd = fiveHour.resets_at ? ` \x1b[2m→${formatTimeET(fiveHour.resets_at)}\x1b[0m` : '';
      subStr = `5h:${buildSubBar(pct)}${fiveEnd}`;
      if (sevenDay != null) {
        const wpct = Math.round(sevenDay.used_percentage);
        const sevenEnd = sevenDay.resets_at ? ` \x1b[2m→${formatDateTimeET(sevenDay.resets_at)}\x1b[0m` : '';
        subStr += ` | 7d:${buildSubBar(wpct)}${sevenEnd}`;
      }
    } else if (sevenDay != null) {
      const wpct = Math.round(sevenDay.used_percentage);
      const sevenEnd = sevenDay.resets_at ? ` \x1b[2m→${formatDateTimeET(sevenDay.resets_at)}\x1b[0m` : '';
      subStr = `7d:${buildSubBar(wpct)}${sevenEnd}`;
    }

    // ── Output ───────────────────────────────────────────────────────────────
    const dirname = path.basename(dir);
    let output = '';

    let modelEffort = `${model} (${effort})`;
    let tokenStrPadding = "";
    if(modelEffort.length < 15) {
      modelEffort = (modelEffort + " ".repeat(15)).slice(0,15);
    }
    else if(modelEffort.length > 15) { 
      tokenStrPadding = " ".repeat(modelEffort.length - 15);
    }


    // Line 1: Model, directory, context
    output += `\x1b[2m${model} (${effort})\x1b[0m │ \x1b[2m${dirname}\x1b[0m`;

    // Line 2: Session metrics and subscription
    if (tokenStr || subStr) {
      output += '\n';
      const line2 = [];
      if (tokenStr) line2.push(`\x1b[2m${tokenStr}${tokenStrPadding}\x1b[0m`);
      if (subStr) line2.push(subStr);
      output += line2.join(' │ ');
    }

    process.stdout.write(output);
  } catch (e) {
    // Silent fail
  }
});
