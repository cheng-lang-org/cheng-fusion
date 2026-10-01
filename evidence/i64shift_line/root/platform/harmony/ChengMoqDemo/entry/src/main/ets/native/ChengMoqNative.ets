import chengMoqDemo from 'libcheng_moq_demo.so';

interface ChengMoqNativeModule {
  // Start the in-app MoQ publisher (Harmony serves the 麦田 clip on 0.0.0.0:38000).
  // Returns 0 once the serve thread is started, negative on setup failure.
  publishServe(resourceManager: Object): number;
}

const nativeBridge = chengMoqDemo as ChengMoqNativeModule;

export default nativeBridge;
