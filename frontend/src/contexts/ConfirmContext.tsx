import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { ConfirmModal } from '../components/ui/ConfirmModal';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    icon?: React.ReactNode;
    children?: React.ReactNode;
  }>({
    isOpen: false,
    title: '',
    message: '',
  });

  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      if (typeof options === 'string') {
        setModalState({
          isOpen: true,
          title: 'Confirmar ação',
          message: options,
          isDestructive: false,
        });
      } else {
        setModalState({
          isOpen: true,
          title: options.title || 'Confirmar ação',
          message: options.message,
          confirmText: options.confirmText,
          cancelText: options.cancelText,
          isDestructive: options.isDestructive ?? true,
          icon: options.icon,
          children: options.children,
        });
      }
    });
  }, []);

  const handleClose = useCallback(() => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
  }, []);

  const handleConfirm = useCallback(() => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
    if (resolverRef.current) {
      resolverRef.current(true);
      resolverRef.current = null;
    }
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <ConfirmModal
        isOpen={modalState.isOpen}
        onClose={handleClose}
        onConfirm={handleConfirm}
        title={modalState.title}
        message={modalState.message}
        confirmText={modalState.confirmText}
        cancelText={modalState.cancelText}
        isDestructive={modalState.isDestructive}
        icon={modalState.icon}
      >
        {modalState.children}
      </ConfirmModal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    return {
      confirm: async () => true,
    };
  }
  return context;
}
