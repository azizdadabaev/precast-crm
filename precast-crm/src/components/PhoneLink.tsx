'use client';

import { digitsOnly, formatPhone } from '@/lib/phone';

interface Props {
  phone: string | null | undefined;
  className?: string;
}

export function PhoneLink({ phone, className }: Props) {
  const formatted = formatPhone(phone);
  if (!formatted) return null;
  return (
    <a
      href={`tel:+${digitsOnly(phone)}`}
      onClick={(e) => e.stopPropagation()}
      title="Қўнғироқ қилиш · Call"
      className={`text-primary hover:underline font-mono tabular-nums whitespace-nowrap${className ? ` ${className}` : ''}`}
    >
      {formatted}
    </a>
  );
}
