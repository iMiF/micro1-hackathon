<template>
  <span class="badge" :class="`badge-${statusId}`">{{ statusLabel(statusId) }}</span>
</template>

<script setup lang="ts">
import { statusLabel } from '../orderStatus.ts'

defineProps<{ statusId: number }>()
</script>
