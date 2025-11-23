'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Settings, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQueryParamConfig, useUpdateConfigQueryParams } from '@/lib/config';
import {
  type ValidationError,
  validateWorldConfig,
  type WorldConfig,
} from '@/lib/config-world';

type SettingsDialogProps = {
  trigger?: React.ReactNode;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: UI config flow needs multiple branches
export function SettingsDialog({ trigger }: SettingsDialogProps) {
  const config = useQueryParamConfig();
  const updateConfig = useUpdateConfigQueryParams();

  const [isOpen, setIsOpen] = useState(false);
  const [localConfig, setLocalConfig] = useState<WorldConfig>(config);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  const backend = localConfig.backend || 'embedded';
  const isEmbedded = backend === 'embedded';

  // Update local config when query params change
  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const handleValidateAndApply = async () => {
    setIsValidating(true);
    try {
      const validationErrors = await validateWorldConfig(localConfig);
      setErrors(validationErrors);

      if (validationErrors.length === 0) {
        updateConfig(localConfig);
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Validation error:', error);
      setErrors([
        {
          field: 'general',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      ]);
    } finally {
      setIsValidating(false);
    }
  };

  const handleInputChange = (field: keyof WorldConfig, value: string) => {
    setLocalConfig((prev) => ({ ...prev, [field]: value }));
    // Clear errors for this field when user types
    setErrors((prev) => prev.filter((e) => e.field !== field));
  };

  const getFieldError = (field: string) => {
    return errors.find((e) => e.field === field)?.message;
  };

  const hasChanges = useMemo(
    () =>
      JSON.stringify(localConfig) !== JSON.stringify(config) ||
      errors.length > 0,
    [config, errors.length, localConfig]
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Open configuration"
          >
            <Settings className="h-5 w-5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader className="flex flex-row items-center justify-between gap-4">
          <DialogTitle className="text-xl font-semibold">
            Configuration
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="backend">Backend</Label>
            <Select
              value={localConfig.backend || 'embedded'}
              onValueChange={(value) => handleInputChange('backend', value)}
            >
              <SelectTrigger id="backend">
                <SelectValue placeholder="Select backend" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="embedded">Embedded</SelectItem>
                <SelectItem value="vercel">Vercel</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isEmbedded && (
            <>
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  value={localConfig.port || ''}
                  onChange={(e) => handleInputChange('port', e.target.value)}
                  placeholder="3001"
                  className={getFieldError('port') ? 'border-destructive' : ''}
                />
                {getFieldError('port') && (
                  <p className="text-sm text-destructive">
                    {getFieldError('port')}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="dataDir">Data Directory</Label>
                <Input
                  id="dataDir"
                  value={localConfig.dataDir || ''}
                  onChange={(e) => handleInputChange('dataDir', e.target.value)}
                  placeholder=".workflow-data or .next/workflow-data"
                  className={
                    getFieldError('dataDir') ? 'border-destructive' : ''
                  }
                />
                {getFieldError('dataDir') && (
                  <p className="text-sm text-destructive">
                    {getFieldError('dataDir')}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Path to the workflow data directory. Can be relative or
                  absolute.
                </p>
              </div>
            </>
          )}

          {!isEmbedded && (
            <>
              <div className="space-y-2">
                <Label htmlFor="env">Environment</Label>
                <Input
                  id="env"
                  value={localConfig.env || 'production'}
                  onChange={(e) => handleInputChange('env', e.target.value)}
                  placeholder="production or preview"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="authToken">Auth Token</Label>
                <Input
                  id="authToken"
                  type="password"
                  value={localConfig.authToken || ''}
                  onChange={(e) =>
                    handleInputChange('authToken', e.target.value)
                  }
                  placeholder="Vercel token"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="project">Project</Label>
                <Input
                  id="project"
                  value={localConfig.project || ''}
                  onChange={(e) => handleInputChange('project', e.target.value)}
                  placeholder="Project name or ID"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="team">Team</Label>
                <Input
                  id="team"
                  value={localConfig.team || ''}
                  onChange={(e) => handleInputChange('team', e.target.value)}
                  placeholder="Team slug or ID"
                />
              </div>
            </>
          )}

          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Validation errors</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1">
                  {errors.map((error, idx) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: Error list order is stable for this render
                    <li key={`error-${idx}`}>
                      {error.field !== 'general' && (
                        <strong>{error.field}:</strong>
                      )}{' '}
                      {error.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setIsOpen(false);
              setLocalConfig(config);
              setErrors([]);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleValidateAndApply}
            disabled={isValidating || !hasChanges}
          >
            {isValidating ? 'Validating...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
