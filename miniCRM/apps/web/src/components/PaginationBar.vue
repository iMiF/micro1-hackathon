<template>
  <div class="pagination">
    <button type="button" class="secondary" :disabled="page <= 1" @click="$emit('update:page', page - 1)">
      Previous
    </button>
    <span class="muted">Page {{ page }} of {{ totalPages }} ({{ total }} total)</span>
    <button type="button" class="secondary" :disabled="page >= totalPages" @click="$emit('update:page', page + 1)">
      Next
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ page: number; pageSize: number; total: number }>()
defineEmits<{ 'update:page': [number] }>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
</script>
