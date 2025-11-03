// app/docs/dev/token-classification/page.tsx
export const dynamic = 'force-static';

export default function Page() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10 text-white">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Token Classification — “Coin Health Lab” 🧪</h1>
        <p className="mt-2 text-sm text-gray-300">
          Healthy / walking_dead / deadcoin / redlist / blacklist karar akışı, ayarlar ve dosya haritası.
        </p>
      </header>

      {/* TL;DR */}
      <section className="mb-10 rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="mb-3 text-xl font-semibold">TL;DR</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-gray-200">
          <li>
            <span className="font-semibold">DEX</span>: DexScreener → (fallback) GeckoTerminal.{" "}
            <span className="font-semibold">CEX</span>: CoinGecko tickers (allowlist).
          </li>
          <li>
            <span className="font-semibold">Ayarlar DB’den</span> (admin_config): vote_threshold, include_cex,
            healthy_min_vol/liq, walking_dead_min_vol/liq.
          </li>
          <li>
            <span className="font-semibold">Kural</span>: Hacim <i>ve</i> likidite birlikte değerlendirilir.
            &nbsp;{`<100`} ⇒ deadcoin · {`100–10k`} ⇒ walking_dead · ≥ healthy eşikleri ⇒ healthy.
          </li>
          <li>
            <span className="font-semibold">Topluluk oyu</span>: YES ≥ vote_threshold ⇒ direkt deadcoin.
          </li>
          <li>Redlist/Blacklist: yalnız admin set eder (otomasyon dışında).</li>
        </ul>
      </section>

      {/* Dosya Haritası */}
      <section className="mb-10">
        <h2 className="mb-3 text-xl font-semibold">Dosya Haritası</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Card
            title="Settings & Cache"
            items={[
              ['app/api/_lib/settings.ts', 'Ayarları admin_config’ten okur; kısa TTL cache; invalidate fonksiyonları.'],
              ['app/api/admin/settings/route.ts', 'GET/PUT; requireAdmin + CSRF; panel bu endpoint’i kullanır.'],
            ]}
          />
          <Card
            title="Hacim & Likidite Toplayıcı"
            items={[
              ['app/api/utils/getVolumeAndLiquidity.ts', 'DEX (DexScreener→GeckoTerminal), CEX (CoinGecko tickers).'],
              ['—', 'Bellek içi küçük TTL cache; kaynak isimleri (dexSource/cexSource) döner.'],
            ]}
          />
          <Card
            title="Karar Mantığı"
            items={[
              ['app/api/_lib/registry.ts', 'computeStatusDecision(…): eşikler + oy kuralı → TokenStatus.'],
              ['—', 'ensureFirstSeenRegistry(…), audit yazımı, status güncellemeleri vb.'],
            ]}
          />
          <Card
            title="Admin UI"
            items={[
              ['app/admin/tokens/page.tsx', 'Ayar kartı, tablo, history, info (modal tetikleyici).'],
              ['components/admin/TokenInfoModal.tsx', 'DEX/CEX breakdown; kapatma & retry; sabit kutu layout.'],
            ]}
          />
        </div>
      </section>

      {/* Karar Akışı */}
      <section className="mb-10 rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="mb-4 text-xl font-semibold">Karar Akışı (pseudo)</h2>
        <pre className="overflow-x-auto rounded-lg bg-black/60 p-4 text-[12px] leading-relaxed">
{`vl = getVolumeAndLiquidity(mint)
// total = (include_cex ? DEX + CEX : DEX)
total = vl.totalVolumeUSD
liq   = vl.dexLiquidityUSD

if YES_votes >= vote_threshold:
  return 'deadcoin'

if total < 100 && liq < 100:
  return 'deadcoin'

if 100 <= total < 10_000 && 100 <= liq < 10_000:
  return 'walking_dead'

if total >= healthy_min_vol_usd && liq >= healthy_min_liq_usd:
  return 'healthy'

// sınır durumlar → walking_dead (hacim/likiditenin biri düşükse)
return 'walking_dead'`}
        </pre>
        <p className="mt-3 text-sm text-gray-300">
          Not: Eşikler <span className="font-mono">/admin/tokens</span> &gt; Admin Settings’ten canlı değişir (deploy gerekmez).
        </p>
      </section>

      {/* API Kısa Rehberi */}
      <section className="mb-10">
        <h2 className="mb-3 text-xl font-semibold">API Kısa Rehberi</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-gray-200">
          <li>GET <span className="font-mono">/api/admin/settings</span> → panel doldurma</li>
          <li>PUT <span className="font-mono">/api/admin/settings</span> → değerleri yaz + cache invalidate</li>
          <li>GET <span className="font-mono">/api/admin/tokens/volume?mint=…</span> → Info modal verisi</li>
          <li>POST <span className="font-mono">/api/admin/tokens</span> → manual status set/reset</li>
          <li>GET <span className="font-mono">/api/admin/registry/stats</span> → “Registry Stats” kutusu</li>
        </ul>
      </section>

      {/* İpuçları */}
      <section className="mb-16">
        <h2 className="mb-3 text-xl font-semibold">İpuçları & Kenar Durumları</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-gray-200">
        <li>Env girmeden çalışır; DB &gt; env (env sadece ilk boot fallback).</li>
          <li>Info modalda kaynak “none” görünüyorsa: ilgili servis yanıt vermemiş olabilir; fallback sırasını kontrol edin.</li>
          <li>Hacim yüksek fakat likidite düşükse (veya tersi): walking_dead’a düşer (ikisi birlikte şart).</li>
        </ul>
      </section>

      <footer className="mt-10 border-t border-white/10 pt-6 text-center text-sm text-gray-400">
        “Bilim insanı gibi ölç, hacker gibi hızlan, admin gibi yön ver.” 🚀
      </footer>
    </main>
  );
}

function Card({
  title,
  items,
}: {
  title: string;
  items: Array<[path: string, desc: string]>;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <h3 className="mb-2 text-base font-semibold">{title}</h3>
      <ul className="space-y-2">
        {items.map(([p, d], i) => (
          <li key={i} className="text-sm">
            <div className="font-mono text-emerald-300">{p}</div>
            <div className="text-gray-300">{d}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
