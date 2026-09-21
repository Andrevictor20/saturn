import { useState, useEffect, type FormEvent } from 'react';
import { KeyRound, Loader2, ShieldCheck, ShieldAlert, Shield, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { UserAvatar } from '../ui/UserAvatar';
import { TwoFactorSetupModal } from '../auth/TwoFactorSetupModal';
import { TwoFactorDisableModal } from '../auth/TwoFactorDisableModal';
import { ActiveSessionsSection } from '../auth/ActiveSessionsSection';

export function AccountTab() {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // 2FA state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState<boolean | null>(null);
  const [recoveryCodesCount, setRecoveryCodesCount] = useState<number>(0);
  const [loading2FA, setLoading2FA] = useState(true);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);

  const fetch2FAStatus = async () => {
    try {
      setLoading2FA(true);
      const token = localStorage.getItem('saturn_token');
      const res = await fetch('/api/auth/2fa/status', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setTwoFactorEnabled(data.enabled);
        setRecoveryCodesCount(data.recovery_codes_count);
      }
    } catch {
      // Ignored if unconfigured
    } finally {
      setLoading2FA(false);
    }
  };

  useEffect(() => {
    fetch2FAStatus();
  }, []);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setIsChangingPassword(true);
    try {
      const token = localStorage.getItem('saturn_token');
      const res = await fetch('/api/auth/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      if (!res.ok) throw new Error('Failed to update password');

      toast.success(t('auth.password_updated') || 'Senha alterada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
    } catch {
      toast.error(t('profile.invalid_current_password', 'Senha atual incorreta ou erro no servidor'));
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3">
        <div className="p-1 rounded-3xl bg-card border border-border/80 shadow-lg shadow-saturn-500/10 flex items-center justify-center">
          <UserAvatar size={76} showGlow className="rounded-2xl" />
        </div>
        <div className="text-center">
          <h3 className="font-bold text-lg text-primary">Admin</h3>
          <span className="text-xs text-secondary">Saturn Administrator</span>
        </div>
      </div>

      {/* Two-Factor Authentication (2FA) Section */}
      <div className="p-4 rounded-2xl bg-card border border-border space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-xl shrink-0 ${
              twoFactorEnabled 
                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                : 'bg-saturn-500/10 text-saturn-500 border border-saturn-500/20'
            }`}>
              {twoFactorEnabled ? <ShieldCheck className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-primary">
                  {t('two_factor.title', 'Autenticação de 2 Fatores (2FA)')}
                </h4>
                {loading2FA ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-secondary" />
                ) : twoFactorEnabled ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                    {t('two_factor.status_active', 'Ativado')}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary/15 text-secondary border border-border">
                    {t('two_factor.status_inactive', 'Desativado')}
                  </span>
                )}
              </div>
              <p className="text-xs text-secondary mt-1 leading-relaxed">
                {twoFactorEnabled
                  ? t(
                      'two_factor.active_desc',
                      'Sua conta está protegida com verificação em duas etapas via aplicativo autenticador.'
                    )
                  : t(
                      'two_factor.inactive_desc',
                      'Adicione uma camada extra de segurança à sua conta exigindo um código do seu celular ao fazer login.'
                    )}
              </p>
              {twoFactorEnabled && (
                <p className="text-[11px] text-secondary mt-2 flex items-center gap-1.5 font-medium">
                  <span>{t('two_factor.remaining_codes', 'Códigos de recuperação disponíveis:')}</span>
                  <span className="px-1.5 py-0.2 rounded bg-background border border-border font-mono text-primary font-bold">
                    {recoveryCodesCount}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-end gap-3 border-t border-border">
          {twoFactorEnabled ? (
            <button
              type="button"
              onClick={() => setIsDisableModalOpen(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-500/10 border border-rose-500/30 transition-all flex items-center gap-1.5 active:scale-95"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{t('two_factor.disable_button', 'Desativar 2FA')}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsSetupModalOpen(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-saturn-500 hover:bg-saturn-600 text-white shadow-sm shadow-saturn-500/20 transition-all flex items-center gap-1.5 active:scale-95"
            >
              <span>{t('two_factor.enable_action', 'Configurar 2FA')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Change Password Form */}
      <form onSubmit={handleChangePassword} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-primary">
            {t('profile.current_password', 'Senha Atual')}
          </label>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full bg-background border border-border rounded-xl py-2.5 pl-10 pr-4 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-saturn-500/30 focus:border-saturn-500 transition-all font-mono"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-primary">
            {t('profile.new_password', 'Nova Senha')}
          </label>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-background border border-border rounded-xl py-2.5 pl-10 pr-4 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-saturn-500/30 focus:border-saturn-500 transition-all font-mono"
              required
              minLength={6}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isChangingPassword}
          className="w-full bg-saturn-500 hover:bg-saturn-600 text-white font-semibold py-2.5 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-md shadow-saturn-500/20 text-sm disabled:opacity-50"
        >
          {isChangingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{t('profile.change_password', 'Alterar Senha')}</span>
        </button>
      </form>

      {/* Active Sessions & Devices */}
      <ActiveSessionsSection />

      {/* Modals */}
      <TwoFactorSetupModal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
        onSuccess={fetch2FAStatus}
      />
      <TwoFactorDisableModal
        isOpen={isDisableModalOpen}
        onClose={() => setIsDisableModalOpen(false)}
        onSuccess={fetch2FAStatus}
      />
    </div>
  );
}
