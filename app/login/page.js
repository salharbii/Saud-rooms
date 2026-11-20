'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  async function go(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) return setErr('بيانات الدخول غير صحيحة');
    router.replace('/');
  }
  return (
    <div className="login">
      <h1>SAUD ROOMS</h1>
      <p className="muted">تسجيل دخول المدير</p>
      <form onSubmit={go} className="card">
        <label>البريد الإلكتروني<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>كلمة المرور<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
        {err && <p className="errbox">{err}</p>}
        <button className="btn" style={{ width: '100%' }}>دخول</button>
      </form>
    </div>
  );
}
