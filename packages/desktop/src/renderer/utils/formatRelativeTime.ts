import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import i18n from '@/renderer/services/i18n';
dayjs.extend(relativeTime);

// 7 天以内用相对时间（"3 分钟前"），超过 7 天用绝对日期
export const formatRelativeTime = (iso: string, locale: string = i18n.language): string => {
  const target = dayjs(iso);
  const now = dayjs();
  const diffDays = now.diff(target, 'day');

  if (diffDays < 7) {
    return target.locale(locale.startsWith('zh') ? 'zh-cn' : 'en').fromNow();
  }
  return target.locale(locale.startsWith('zh') ? 'zh-cn' : 'en').format('YYYY-MM-DD');
};

// 给 tooltip 用的完整时间，永远是绝对时间
export const formatAbsoluteTime = (iso: string, locale: string = i18n.language): string => {
  return dayjs(iso)
    .locale(locale.startsWith('zh') ? 'zh-cn' : 'en')
    .format('YYYY-MM-DD HH:mm');
};
