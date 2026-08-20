/** 2点間の距離(m)。ハバースイン公式 */
export function haversine(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 速度(m/s) から METs を推定する */
export function metForSpeed(metersPerSec: number): number {
  if (metersPerSec < 0.9) return 2.0;
  if (metersPerSec < 1.3) return 3.0;
  if (metersPerSec < 1.8) return 4.3;
  if (metersPerSec < 2.2) return 7.0;
  if (metersPerSec < 2.7) return 9.8;
  if (metersPerSec < 3.3) return 11.5;
  return 13.0;
}

/** ペース（分/km）の文字列。距離0のときは "--'--" */
export function formatPace(meters: number, seconds: number): string {
  if (meters < 20 || seconds <= 0) return "--:--";
  const secPerKm = seconds / (meters / 1000);
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  if (m > 99) return "--:--";
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 座標列を 0〜100 の SVG ポリラインに変換する（地図タイルを使わずに軌跡の形だけ描く） */
export function pathToPolyline(path: { lat: number; lng: number }[]): string {
  if (path.length < 2) return "";
  const lats = path.map((p) => p.lat);
  const lngs = path.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  // 緯度による経度方向の縮みを補正して形をゆがませない
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const spanLat = Math.max(1e-6, maxLat - minLat);
  const spanLng = Math.max(1e-6, (maxLng - minLng) * Math.cos(midLat));
  const span = Math.max(spanLat, spanLng);

  return path
    .map((p) => {
      const x = 50 + (((p.lng - (minLng + maxLng) / 2) * Math.cos(midLat)) / span) * 90;
      const y = 50 - ((p.lat - (minLat + maxLat) / 2) / span) * 90;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
