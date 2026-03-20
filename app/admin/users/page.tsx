'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { KeyRound, Loader2, Plus, Trash2, UserCog } from 'lucide-react';
import { toast } from 'sonner';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: number;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addRole, setAddRole] = useState('learner');
  const [adding, setAdding] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  async function load() {
    const res = await fetch('/api/admin/users');
    const data = await res.json();
    setUsers(data.users || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function changeRole(userId: string, role: string) {
    const res = await fetch('/api/admin/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    });
    if (res.ok) {
      toast.success('Role updated');
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
    } else {
      toast.error('Failed to update role');
    }
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addName,
          email: addEmail,
          password: addPassword,
          role: addRole,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('User created');
      setAddOpen(false);
      setAddName('');
      setAddEmail('');
      setAddPassword('');
      await load();
    } catch {
      toast.error('Failed to create user');
    } finally {
      setAdding(false);
    }
  }

  async function deleteUser(userId: string) {
    if (
      !confirm(
        'Delete this user permanently? This will remove their sessions and account credentials.',
      )
    )
      return;
    const res = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });

    if (res.ok) {
      toast.success('User deleted');
      await load();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? 'Failed to delete user');
    }
  }

  function openReset(userId: string) {
    setResetUserId(userId);
    setResetPassword('');
    setResetOpen(true);
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUserId) return;
    setResetting(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: resetUserId, newPassword: resetPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to reset password');
      }
      toast.success('Password reset');
      setResetOpen(false);
      setResetUserId(null);
      setResetPassword('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground">Manage learner accounts</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add user
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create new user</DialogTitle>
            </DialogHeader>
            <form onSubmit={addUser} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={addName} onChange={(e) => setAddName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={addRole} onValueChange={setAddRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="learner">Learner</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={adding}>
                {adding && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Create user
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Reset password dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitReset} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>New password</Label>
              <Input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={resetting}
                onClick={() => setResetOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={resetting}>
                {resetting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <KeyRound className="h-4 w-4 mr-2" />
                )}
                Reset password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">{users.length} users</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 p-0">
          {loading ? (
            <div className="flex items-center gap-2 p-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : users.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No users yet</p>
          ) : (
            users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between border-b last:border-0 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge>
                  <Select value={u.role} onValueChange={(role) => changeRole(u.id, role)}>
                    <SelectTrigger className="h-7 w-7 p-0 border-0 bg-transparent">
                      <UserCog className="h-4 w-4 text-muted-foreground" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="learner">Set as Learner</SelectItem>
                      <SelectItem value="admin">Set as Admin</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Reset password */}
                  <Button variant="outline" size="sm" onClick={() => openReset(u.id)}>
                    <KeyRound className="h-4 w-4 mr-1" />
                    Reset
                  </Button>

                  {/* Delete user */}
                  <Button variant="destructive" size="sm" onClick={() => deleteUser(u.id)}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
