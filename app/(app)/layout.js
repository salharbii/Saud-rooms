'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const LINKS = [['/', 'الرئيسية'], ['/rooms', 'الغرف'], ['/contracts', 'غير الشهرية'], ['/electricity', 'الكهرباء'], ['/maintenance', 'الصيانة والمصاريف'], ['/reports', 'التقارير']];

export default function AppLayout({ children }) {
  const router = useRouter();
  const path = usePathname();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => (data.session ? setOk(true) : router.replace('/login')));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (!s) router.replace('/login'); });
    return () => sub.subscription.unsubscribe();
  }, [router]);
  if (!ok) return <p className="muted" style={{ padding: 20 }}>جارٍ التحقق…</p>;
  return (
    <>
      <nav className="nav">
        <b>SAUD ROOMS</b>
        {LINKS.map(([h, t]) => <Link key={h} href={h} className={path === h ? 'on' : ''}>{t}</Link>)}
        <button onClick={() => supabase.auth.signOut()}>خروج</button>
      </nav>
      <main>{children}</main>
    </>
  );
}
