import Vue from "vue";
import { debounce } from "@/utils";

export default Vue.extend({
  data() {
    return {
      $_sidebarElm: null as Element | null,
      $_resizeHandler: null as (() => void) | null,
    };
  },
  mounted() {
    this.initListener();
  },
  activated() {
    if (!this.$_resizeHandler) {
      // avoid duplication init
      this.initListener();
    }

    // when keep-alive chart activated, auto resize
    this.resize();
  },
  beforeDestroy() {
    this.destroyListener();
  },
  deactivated() {
    this.destroyListener();
  },
  methods: {
    // use $_ for mixins properties
    // https://vuejs.org/v2/style-guide/index.html#Private-property-names-essential
    $_sidebarResizeHandler(event: Event) {
      if ((event as TransitionEvent).propertyName === "width") {
        this.$_resizeHandler?.();
      }
    },
    initListener() {
      this.$_resizeHandler = debounce(() => {
        this.resize();
      }, 100);
      window.addEventListener("resize", this.$_resizeHandler);
      this.$_sidebarElm = document.getElementsByClassName("el-aside")[0];
      this.$_sidebarElm &&
        this.$_sidebarElm.addEventListener(
          "transitionend",
          this.$_sidebarResizeHandler
        );
    },
    destroyListener() {
      if (this.$_resizeHandler) {
        window.removeEventListener("resize", this.$_resizeHandler);
      }
      this.$_resizeHandler = null;

      this.$_sidebarElm &&
        this.$_sidebarElm.removeEventListener(
          "transitionend",
          this.$_sidebarResizeHandler
        );
    },
    resize() {
      const { chart } = this as typeof this & { chart?: { resize(): void } };
      chart && chart.resize();
    },
  },
});
