import React, { useState } from 'react';
import { useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Lock, User, KeyRound, AlertCircle, Eye, EyeOff, Sparkles, ShieldCheck, ArrowLeft } from 'lucide-react';
import { SaturnLogo } from '../components/ui/SaturnLogo';

export function Login() {
  const { t } = useTranslation();
  const { wallpaperUrl, wallpaperOpacity, wallpaperBlur } = useTheme();
  const [searchParams] = useSearchParams();
  const isUpdated = searchParams.get('updated') === 'true';
  const updatedVersion = searchParams.get('version') || localStorage.getItem('saturn_last_updated_version');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // 2FA state
  const [step, setStep] = useState<'credentials' | '2fa'>('credentials');
  const [tempToken, setTempToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');

  const { login, needsSetup } = useAuth();
  const navigate = useNavigate();

  if (needsSetup) {
    return <Navigate to="/setup" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username || !password) {
      setError(t('auth.required_fields', 'Por favor, preencha todos os campos.'));
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(t('auth.invalid_credentials', 'Credenciais inválidas.'));
        } else if (response.status === 429) {
          throw new Error(t('auth.too_many_attempts', 'Muitas tentativas. Aguarde 5 minutos.'));
        } else {
          throw new Error(t('auth.server_error', 'Erro ao conectar com o servidor.'));
        }
      }

      const data = await response.json();
      
      // If 2FA is required, transition to 2FA verification step
      if (data.requires_2fa && data.temp_token) {
        setTempToken(data.temp_token);
        setStep('2fa');
        setTwoFactorCode('');
        setError('');
        return;
      }

      await login(data.token || 'logged_in_token');
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || t('auth.login_error', 'Erro ao realizar login.'));
    } finally {
      setLoading(false);
    }
  };

  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanCode = twoFactorCode.trim();
    if (!cleanCode) {
      setError(t('two_factor.enter_code', 'Por favor, digite o código de autenticação ou recuperação.'));
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/2fa/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          temp_token: tempToken,
          code: cleanCode,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(t('two_factor.invalid_code', 'Código de autenticação ou recuperação inválido.'));
        } else if (response.status === 429) {
          throw new Error(t('auth.too_many_attempts', 'Muitas tentativas. Aguarde 5 minutos.'));
        } else {
          throw new Error(t('auth.server_error', 'Erro ao conectar com o servidor.'));
        }
      }

      const data = await response.json();
      await login(data.token || 'logged_in_token');
      navigate('/');
    } catch (err: any) {
      setError(err.message || t('two_factor.invalid_code', 'Código inválido.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden text-secondary">
      {/* Custom Wallpaper Layer with Frosted Glass Contrast Veil */}
      {wallpaperUrl && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none" aria-hidden="true">
          <img
            src={wallpaperUrl}
            alt=""
            className="w-full h-full object-cover transition-all duration-500 ease-out will-change-transform"
            style={{
              filter: wallpaperBlur > 0 ? `blur(${wallpaperBlur}px)` : 'none',
              transform: wallpaperBlur > 0 ? 'scale(1.03)' : 'scale(1)',
            }}
          />
          <div
            className="absolute inset-0 bg-background transition-colors duration-300"
            style={{ opacity: wallpaperOpacity }}
          />
        </div>
      )}

      {/* Ambient Lighting & Glow Orbs (Active only without wallpaper to preserve authentic photo colors) */}
      {!wallpaperUrl && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 transition-opacity duration-500 opacity-80">
          <div className="absolute -top-36 -right-32 w-[650px] h-[650px] rounded-full bg-gradient-to-br from-saturn-500/20 via-purple-600/12 to-transparent blur-[140px] opacity-80 animate-float-slow" />
          <div className="absolute top-1/4 -left-48 w-[720px] h-[720px] rounded-full bg-gradient-to-tr from-saturn-600/16 via-cyan-500/10 to-transparent blur-[150px] opacity-75 animate-float-reverse" />
          <div className="absolute -bottom-40 right-1/4 w-[600px] h-[600px] rounded-full bg-gradient-to-tl from-indigo-500/16 via-pink-500/10 to-transparent blur-[140px] opacity-70 animate-pulse-glow" />
        </div>
      )}

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 animate-fade-in">
        <div className="flex justify-center">
          <div className="p-1 rounded-3xl bg-card/90 backdrop-blur-xl border border-border/80 shadow-2xl shadow-saturn-500/10 flex items-center justify-center transform hover:scale-105 transition-transform duration-500">
            <SaturnLogo size={64} className="rounded-2xl" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold tracking-tight text-primary">
          Saturn
        </h2>
        <p className="mt-2 text-center text-sm text-secondary">
          {t('auth.login_subtitle', 'Painel de Controle de Contêineres')}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 animate-slide-up">
        <div className="bg-card/90 backdrop-blur-xl py-8 px-4 shadow-2xl sm:rounded-2xl sm:px-10 border border-border/80 hover:shadow-saturn-500/10 transition-shadow duration-500">
          {isUpdated && step === 'credentials' && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3 text-left animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-500 shrink-0 mt-0.5">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-primary flex items-center gap-1.5">
                  {t('auth.update_success_banner_title', 'Saturn Atualizado com Sucesso!')}
                  {updatedVersion && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 border border-emerald-500/40">
                      v{updatedVersion.replace(/^v/, '')}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-secondary mt-1 leading-relaxed">
                  {t('auth.update_success_banner_msg', 'O sistema foi atualizado para a versão mais recente. Faça login para acessar o painel.')}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 bg-rose-500/10 border border-rose-500/50 rounded-lg p-3 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-rose-500 font-medium">{error}</p>
            </div>
          )}

          {step === 'credentials' ? (
            <form className="space-y-6" onSubmit={handleSubmit} action="#">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-primary">
                  {t('auth.username', 'Usuário')}
                </label>
                <div className="mt-2 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-secondary" />
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 bg-background border border-border rounded-xl text-primary placeholder:text-secondary/60 focus:outline-none focus:ring-2 focus:ring-saturn-500/50 focus:border-saturn-500 text-sm transition-colors shadow-sm"
                    placeholder={t('auth.username', 'Seu usuário')}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-primary">
                  {t('auth.password', 'Senha')}
                </label>
                <div className="mt-2 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-secondary" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-10 py-2.5 bg-background border border-border rounded-xl text-primary placeholder:text-secondary/60 focus:outline-none focus:ring-2 focus:ring-saturn-500/50 focus:border-saturn-500 text-sm transition-colors shadow-sm"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-saturn-600 hover:bg-saturn-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-saturn-500 disabled:opacity-50 transition-all duration-300 transform active:scale-95"
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>{t('auth.signing_in', 'Entrando...')}</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <KeyRound className="w-4 h-4" />
                      <span>{t('auth.sign_in', 'Entrar no Dashboard')}</span>
                    </div>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* 2FA Verification View */
            <form className="space-y-6 animate-fade-in" onSubmit={handleTwoFactorSubmit}>
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-saturn-500/10 text-saturn-500 flex items-center justify-center mx-auto border border-saturn-500/20">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-primary">
                  {t('two_factor.verification_title', 'Verificação em Duas Etapas')}
                </h3>
                <p className="text-xs text-secondary leading-relaxed max-w-xs mx-auto">
                  {t(
                    'two_factor.login_instruction',
                    'Digite o código de 6 dígitos gerado pelo seu app autenticador ou utilize um código de recuperação.'
                  )}
                </p>
              </div>

              <div>
                <label htmlFor="2fa-code" className="block text-xs font-semibold text-primary mb-2 text-center">
                  {t('two_factor.code_label', 'Código de Autenticação / Recuperação')}
                </label>
                <input
                  id="2fa-code"
                  type="text"
                  autoFocus
                  autoComplete="one-time-code"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.toUpperCase())}
                  placeholder="000000"
                  className="block w-full text-center py-3 bg-background border border-border rounded-xl text-primary font-mono text-xl tracking-widest focus:outline-none focus:ring-2 focus:ring-saturn-500/50 focus:border-saturn-500 transition-all shadow-sm"
                  required
                />
              </div>

              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={loading || !twoFactorCode.trim()}
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-saturn-600 hover:bg-saturn-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-saturn-500 disabled:opacity-50 transition-all duration-300 transform active:scale-95"
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>{t('two_factor.verifying', 'Verificando...')}</span>
                    </div>
                  ) : (
                    <span>{t('two_factor.verify_and_enter', 'Verificar e Entrar')}</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStep('credentials');
                    setError('');
                    setTwoFactorCode('');
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-secondary hover:text-primary transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{t('two_factor.back_to_login', 'Voltar para usuário e senha')}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
