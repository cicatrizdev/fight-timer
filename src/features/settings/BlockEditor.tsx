import { useTranslation } from 'react-i18next'
import { useConfigStore, type BlockConfig } from '../../stores/configStore'
import { DurationField, NumberField, Toggle } from './fields'

export function BlockEditor({ block, index, removable }: { block: BlockConfig; index: number; removable: boolean }) {
  const { t } = useTranslation()
  const updateBlock = useConfigStore((s) => s.updateBlock)
  const removeBlock = useConfigStore((s) => s.removeBlock)
  const patch = (p: Partial<BlockConfig>) => updateBlock(block.id, p)

  return (
    <div className="block">
      <div className="block__header">
        <span className="block__title">{t('settings.block', { n: index + 1 })}</span>
        {removable && (
          <button
            type="button"
            className="block__remove"
            aria-label={t('settings.removeBlock')}
            onClick={() => removeBlock(block.id)}
          >
            ✕
          </button>
        )}
      </div>
      <NumberField label={t('settings.rounds')} value={block.rounds} onChange={(v) => patch({ rounds: v })} />
      <DurationField
        label={t('settings.roundDuration')}
        value={block.roundSec}
        step={15}
        min={15}
        onChange={(v) => patch({ roundSec: v })}
      />
      <DurationField
        label={t('settings.rest')}
        value={block.restSec}
        step={15}
        onChange={(v) => patch({ restSec: v })}
      />
      <Toggle
        label={t('settings.cycleToggle')}
        checked={block.cycleEnabled}
        onChange={(v) => patch({ cycleEnabled: v })}
      />
      {block.cycleEnabled && (
        <>
          <DurationField
            label={t('settings.workSec')}
            value={block.workSec}
            step={5}
            min={5}
            onChange={(v) => patch({ workSec: v })}
          />
          <DurationField
            label={t('settings.easeSec')}
            value={block.easeSec}
            step={5}
            min={5}
            onChange={(v) => patch({ easeSec: v })}
          />
        </>
      )}
    </div>
  )
}
