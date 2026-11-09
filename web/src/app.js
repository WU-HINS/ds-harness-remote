import { initTheme, initNavigation, initChrome, initPalette } from './shared.js'
import * as home from './pages/home.js'
import * as account from './pages/account.js'
import * as devices from './pages/devices.js'
import * as keys from './pages/keys.js'
import * as admin from './pages/admin.js'
import * as adminSettings from './pages/adminSettings.js'
import * as register from './pages/register.js'
import * as forgot from './pages/forgot.js'
import * as bind from './pages/bind.js'

const pages = { home, account, devices, keys, admin, 'admin-settings': adminSettings, register, forgot, bind }

initTheme()

document.addEventListener('DOMContentLoaded', () => {
  initNavigation()
  initChrome()
  initPalette()
  const page = document.body.dataset.page
  if (pages[page]) pages[page].init()
})
