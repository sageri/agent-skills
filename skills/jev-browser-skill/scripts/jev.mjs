// loop / check / read 共通の TypeSafe System One クライアント。依存ゼロ（グローバル fetch のみ）。

export async function jev(body) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
    if ([429, 503, 529].includes(r.status) && attempt < 2) {
      await new Promise((res) => setTimeout(res, 500 * 2 ** attempt));
      continue;
    }
    if (!r.ok) throw new Error(`TypeSafe HTTP ${r.status}: ${(await r.text()).slice(0, 300)}; no action executed.`);
    return r.json();
  }
}

// Choice の回答を検証：選択肢・確率分布・confidence が壊れていたら例外
export function validateChoice(ans, ids) {
  const p = ans?.probabilities;
  const nums = p ? [...Object.values(p), ans.confidence] : [];
  const ok = p && ids.includes(ans.choice) &&
    Object.keys(p).length === ids.length && ids.every((id) => id in p) &&
    nums.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1) &&
    Math.abs(Object.values(p).reduce((x, y) => x + y, 0) - 1) < 0.02 &&
    p[ans.choice] >= Math.max(...Object.values(p)) - 1e-6;
  if (!ok) throw new Error('Invalid TypeSafe response; no action executed.');
  return ans;
}

// Choice の確率分布を降順に並べ、上位 n 件の [id, p] を返す
export const topChoices = (ans, n = 5) => Object.entries(ans.probabilities).sort((x, y) => y[1] - x[1]).slice(0, n);
