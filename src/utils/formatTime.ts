import { format, getTime, formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
// ----------------------------------------------------------------------
export function fItalianDate(date) {
  if (date) {
    return format(new Date(date), 'PPP', { locale: it });
  }
}
export function fItalianDateTime(date) {
  if (date) {
    const parsedDate = new Date(date);
    if (isNaN(parsedDate)) {
      console.error('Invalid date:', date);
      return null;
    }
    return format(parsedDate, 'dd/MM/yyyy HH:mm', { locale: it });
  }

  return null; // Return null if date is falsy
}
export function fDate(date) {
  if (date) {
    return format(new Date(date), 'dd MMM yyyy');
  }
}
export function fDateString(date) {
  if (date) {
    return format(new Date(date), 'dd/MM/yyyy');
  }
}

export function fDateTime(date) {
  if (date) {
    const dateObj = new Date(date);
    const options = {
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
export function fTimestamp(date) {
  return getTime(new Date(date));
}

export function fDateTimeSuffix(date) {
  return format(new Date(date), 'dd/MM/yyyy hh:mm a');
}
export function fDayTime(date) {
  return format(new Date(date), 'HH:mm');
}
export function fToNow(date) {
  return formatDistanceToNow(new Date(date), {
    addSuffix: true,
  });
}
