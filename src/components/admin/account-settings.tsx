"use client";

import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import { KeyRound, Loader2 } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export function AccountSettings() {
    const [username, setUsername] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    useEffect(() => {
        apiClient.get<{ username: string }>('/api/admin/account')
            .then(data => setUsername(data.username))
            .catch(() => setMessage('无法加载账号信息，请刷新重试'))
            .finally(() => setLoading(false));
    }, []);
    async function save(event: React.FormEvent) {
        event.preventDefault();
        setMessage('');
        if (password !== confirmPassword) return setMessage('两次输入的新密码不一致');
        setSaving(true);
        try {
            await apiClient.patch('/api/admin/account', { username, currentPassword, ...(password ? { password } : {}) });
            await signOut({ callbackUrl: '/login?updated=1' });
        } catch (error) {
            const data = error instanceof ApiError ? error.data as { message?: string } : null;
            setMessage(data?.message || '更新失败，请重试');
        } finally { setSaving(false); }
    }
    return <Card className="border-slate-200 shadow-sm">
        <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><KeyRound className="size-5 text-indigo-500" />管理员登录设置</CardTitle>
            <CardDescription>修改当前管理员的用户名和密码，保存后重新登录。留空新密码可保持当前密码。</CardDescription>
        </CardHeader>
        <CardContent>
            <form onSubmit={save} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label htmlFor="admin-username">登录用户名</Label><Input id="admin-username" value={username} onChange={e => setUsername(e.target.value)} minLength={3} maxLength={40} required disabled={loading || saving} autoComplete="username" /></div>
                    <div className="space-y-2"><Label htmlFor="admin-current-password">当前密码</Label><Input id="admin-current-password" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required autoComplete="current-password" disabled={loading || saving} /></div>
                    <div className="space-y-2"><Label htmlFor="admin-new-password">新密码（至少 5 个字符）</Label><Input id="admin-new-password" type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={5} autoComplete="new-password" disabled={loading || saving} /></div>
                    <div className="space-y-2"><Label htmlFor="admin-confirm-password">确认新密码</Label><Input id="admin-confirm-password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required={!!password} autoComplete="new-password" disabled={loading || saving} /></div>
                </div>
                {message && <p role="alert" className="text-sm text-red-600">{message}</p>}
                <Button disabled={loading || saving} type="submit">{saving && <Loader2 className="mr-2 size-4 animate-spin" />}保存登录设置</Button>
            </form>
        </CardContent>
    </Card>;
}
