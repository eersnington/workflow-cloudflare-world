'use client';

import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsDialog } from './settings-dialog';

export function SettingsSidebar() {
  return (
    <SettingsDialog
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="p-2 rounded-full hover:bg-accent transition-colors"
          title="Configuration"
        >
          <Settings className="h-6 w-6" />
          <span className="sr-only">Open configuration</span>
        </Button>
      }
    />
  );
}
