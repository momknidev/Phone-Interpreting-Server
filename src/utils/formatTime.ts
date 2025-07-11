import { format, getTime, formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
// ----------------------------------------------------------------------
export function fItalianDate(date: string) {
  if (date) {
    return format(new Date(date), 'PPP', { locale: it });
  }
}
export function fItalianDateTime(date: string) {
  if (date) {
    const parsedDate: any = new Date(date);
    if (isNaN(parsedDate)) {
      console.error('Invalid date:', date);
      return null;
    }
    return format(parsedDate, 'dd/MM/yyyy HH:mm', { locale: it });
  }

  return null; // Return null if date is falsy
}
export function fDate(date: string) {
  if (date) {
    return format(new Date(date), 'dd MMM yyyy');
  }
}
export function fDateString(date: string) {
  if (date) {
    return format(new Date(date), 'dd/MM/yyyy');
  }
}

export function fDateTime(date: string) {
  if (date) {
    const dateObj = new Date(date);
    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'Europe/Rome', // Set Italian timezone (CET/CEST)
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false, // 24-hour format, better for Italy
    };
    const formattedDateTime = new Intl.DateTimeFormat('it-IT', options).format(dateObj);

    const timeZoneAbbr = dateObj
      .toLocaleString('it-IT', { timeZone: 'Europe/Rome', timeZoneName: 'short' })
      .split(' ')
      .pop();

    return `${formattedDateTime} ${timeZoneAbbr}`;
  }
  return '';
}
export function fTimestamp(date: string) {
  return getTime(new Date(date));
}

export function fDateTimeSuffix(date: string) {
  return format(new Date(date), 'dd/MM/yyyy hh:mm a');
}
export function fDayTime(date: string) {
  return format(new Date(date), 'HH:mm');
}
export function fToNow(date: string) {
  return formatDistanceToNow(new Date(date), {
    addSuffix: true,
  });
}
