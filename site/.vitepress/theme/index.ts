
import DefaultTheme, {VPButton} from 'vitepress/theme'

import type {Theme} from 'vitepress'

import CustomLayout from './CustomLayout.vue'

import './custom.sass'
import '@gracious.tech/fetch-client/client.css'
import '@gracious.tech/fetch-enhancer/styles.css'


export default {
    ...DefaultTheme,
    Layout: CustomLayout,
    enhanceApp(ctx){
        ctx.app.component('VPButton', VPButton)
    },
} as Theme
