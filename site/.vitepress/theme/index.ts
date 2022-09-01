
import DefaultTheme from 'vitepress/theme'
import VPButton from 'vitepress/dist/client/theme-default/components/VPButton.vue'
import {Theme} from 'vitepress'

import './custom.sass'

export default {
    ...DefaultTheme,
    enhanceApp(ctx){
        ctx.app.component('VPButton', VPButton)
    },
} as Theme
