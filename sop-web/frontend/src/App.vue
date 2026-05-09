<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import MainLayout from '@/layouts/MainLayout.vue';
import AuthLayout from '@/layouts/AuthLayout.vue';

const route = useRoute();
const layout = computed(() => route.meta.layout ?? 'auth');
</script>

<template>
  <MainLayout v-if="layout === 'main'">
    <RouterView />
  </MainLayout>
  <AuthLayout v-else>
    <RouterView />
  </AuthLayout>
</template>
