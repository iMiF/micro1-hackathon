<template>
  <div v-if="open" class="overlay" role="presentation" @click.self="onCancel">
    <div class="dialog" role="dialog" aria-modal="true" :aria-labelledby="titleId" data-testid="confirm-dialog">
      <h2 :id="titleId">{{ title }}</h2>
      <p>{{ text }}</p>
      <div class="actions">
        <button type="button" class="secondary" data-testid="confirm-dialog-cancel" @click="onCancel">
          {{ cancelLabel }}
        </button>
        <button type="button" class="danger" data-testid="confirm-dialog-accept" @click="onAccept">
          {{ acceptLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    text: string
    acceptLabel?: string
    cancelLabel?: string
  }>(),
  { acceptLabel: 'Delete permanently', cancelLabel: 'Cancel' },
)

const emit = defineEmits<{ cancel: []; accept: [] }>()
const titleId = 'confirm-dialog-title'

function onCancel() {
  emit('cancel')
}
function onAccept() {
  emit('accept')
}

void props.open
</script>
