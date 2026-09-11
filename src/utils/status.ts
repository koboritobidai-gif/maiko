// Japan Plaza pipeline stage names come from uysot in Uzbek. Map the known
// ones to Japanese for the dashboard; fall back to the original name.
const DICT: Record<string, string> = {
  'qabul qilindi': '受付',
  'yangi murojatlar': '新規問い合わせ',
  'yangi murojaatlar': '新規問い合わせ',
  ishlayabman: '対応中',
  "aloqa o'rnatildi": '連絡済み',
  'aloqa ornatildi': '連絡済み',
  "qabul qilinmagan qo'ngiroqlar": '不在着信',
  'qabul qilinmagan qongiroqlar': '不在着信',
  "kp jo'natildi": '提案書送付',
  'kp jonatildi': '提案書送付',
  'uchrashuv belgilandi': '商談設定',
  'muvaffaqiyatli yopildi': '成約',
  'muvaffaqiyatsiz yopildi': '失注',
};

export function translateStatus(name: string): string {
  if (!name) return name;
  const key = name.trim().toLowerCase();
  return DICT[key] || name;
}
