'use client';
import { useEffect } from 'react';

/** Sets the browser tab title to "Jay Capital - {Borrower Name}". */
export default function PortalTitle({ name }: { name: string }) {
  useEffect(() => {
    document.title = name ? `Jay Capital - ${name}` : 'Jay Capital - Portal';
  }, [name]);
  return null;
}
