import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle, X } from 'lucide-react';

import { useTranslation } from 'react-i18next';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  isDestructive = true,
  icon,
  children
}: ConfirmModalProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const resolvedConfirm = confirmText ?? t('common.confirm', 'Confirmar');
  const resolvedCancel = cancelText ?? t('common.cancel', 'Cancelar');

  return typeof document !== 'undefined' ? createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden animate-slide-up relative my-auto max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className={`p-3 rounded-2xl shrink-0 ${isDestructive ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400' : 'bg-saturn-500/15 text-saturn-600 dark:text-saturn-400'}`}>
              {icon ? icon : isDestructive ? <AlertTriangle className="w-6 h-6" /> : <HelpCircle className="w-6 h-6" />}
            </div>
            <h3 className="text-lg font-bold text-primary">{title}</h3>
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-secondary hover:text-primary transition-colors rounded-xl hover:bg-accent"
              aria-label={t('common.close', 'Fechar')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="mb-6 text-slate-700 dark:text-secondary text-sm font-medium leading-relaxed">
            {message}
          </div>

          {children && (
            <div className="mb-6 space-y-3">
              {children}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg font-medium text-slate-700 dark:text-secondary hover:text-primary hover:bg-accent transition-colors"
            >
              {resolvedCancel}
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`px-4 py-2 rounded-lg font-medium text-white transition-colors ${
                isDestructive 
                  ? 'bg-rose-500 hover:bg-rose-600' 
                  : 'bg-saturn-600 hover:bg-saturn-700'
              }`}
            >
              {resolvedConfirm}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  ) : null;
}
