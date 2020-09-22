import * as Tree from '../Tree'
import { Folder } from '../Tree'
import Logger from '../Logger'
import Adapter from '../interfaces/Adapter'
import browser from '../browser-api'
import { difference} from 'lodash'

const url = require('url')

export default class CachingAdapter extends Adapter {
  constructor(server) {
    super()
    this.highestId = 0
    this.bookmarksCache = new Folder({ id: 0, title: 'root' })
  }

  getLabel() {
    let data = this.getData()
    return data.username + '@' + url.parse(data.url).hostname
  }

  async getBookmarksTree() {
    return this.bookmarksCache.clone()
  }

  acceptsBookmark(bm) {
    if (bm.url === 'data:') {
      return false
    }
    return ~['https:', 'http:', 'ftp:', 'data:', 'javascript:'].indexOf(
      url.parse(bm.url).protocol
    )
  }

  async createBookmark(bm) {
    Logger.log('CREATE', bm)
    bm.id = ++this.highestId
    const foundFolder = this.bookmarksCache.findFolder(bm.parentId)
    if (!foundFolder) {
      throw new Error(browser.i18n.getMessage('Error001'))
    }
    foundFolder.children.push(bm)
    this.bookmarksCache.createIndex()
    return bm.id
  }

  async updateBookmark(newBm) {
    Logger.log('UPDATE', newBm)
    const foundBookmark = this.bookmarksCache.findBookmark(newBm.id)
    if (!foundBookmark) {
      throw new Error(browser.i18n.getMessage('Error002'))
    }
    foundBookmark.url = newBm.url
    foundBookmark.title = newBm.title
    if (foundBookmark.parentId === newBm.parentId) {
      return
    }
    const foundOldFolder = this.bookmarksCache.findFolder(
      foundBookmark.parentId
    )
    if (!foundOldFolder) {
      throw new Error(browser.i18n.getMessage('Error003'))
    }
    const foundNewFolder = this.bookmarksCache.findFolder(newBm.parentId)
    if (!foundNewFolder) {
      throw new Error(browser.i18n.getMessage('Error004'))
    }
    foundOldFolder.children.splice(
      foundOldFolder.children.indexOf(foundBookmark),
      1
    )
    foundNewFolder.children.push(foundBookmark)
    foundBookmark.parentId = newBm.parentId
    this.bookmarksCache.createIndex()
  }

  async removeBookmark(bookmark) {
    Logger.log('REMOVE', { bookmark })
    let id = bookmark.id
    const foundBookmark = this.bookmarksCache.findBookmark(id)
    if (!foundBookmark) {
      return
    }
    const foundOldFolder = this.bookmarksCache.findFolder(
      foundBookmark.parentId
    )
    if (!foundOldFolder) {
      return
    }
    foundOldFolder.children.splice(
      foundOldFolder.children.indexOf(foundBookmark),
      1
    )
    this.bookmarksCache.createIndex()
  }

  async createFolder(folder) {
    Logger.log('CREATEFOLDER', { folder })
    const newFolder = new Tree.Folder({ parentId: folder.parentId, title: folder.title })
    newFolder.id = ++this.highestId
    const foundParentFolder = this.bookmarksCache.findFolder(newFolder.parentId)
    if (!foundParentFolder) {
      throw new Error(browser.i18n.getMessage('Error005'))
    }
    foundParentFolder.children.push(newFolder)
    this.bookmarksCache.createIndex()
    return newFolder.id
  }

  async updateFolder(folder) {
    Logger.log('UPDATEFOLDER', { folder })
    let id = folder.id
    const oldFolder = this.bookmarksCache.findFolder(id)
    if (!oldFolder) {
      throw new Error(browser.i18n.getMessage('Error006'))
    }

    const foundOldParentFolder = this.bookmarksCache.findFolder(oldFolder.parentId)
    if (!foundOldParentFolder) {
      throw new Error(browser.i18n.getMessage('Error008'))
    }
    const foundNewParentFolder = this.bookmarksCache.findFolder(folder.parentId)
    if (!foundNewParentFolder) {
      throw new Error(browser.i18n.getMessage('Error009'))
    }
    if (oldFolder.findFolder(foundNewParentFolder.id)) {
      throw new Error('Detected creation of folder loop')
    }
    foundOldParentFolder.children.splice(foundOldParentFolder.children.indexOf(oldFolder), 1)
    foundNewParentFolder.children.push(oldFolder)
    oldFolder.title = folder.title
    oldFolder.parentId = folder.parentId
    this.bookmarksCache.createIndex()
  }

  async orderFolder(id, order) {
    Logger.log('ORDERFOLDER', { id, order })

    let folder = this.bookmarksCache.findFolder(id)
    if (!folder) {
      throw new Error(browser.i18n.getMessage('Error010'))
    }
    order.forEach(item => {
      let child = folder.findItem(item.type, item.id)
      if (!child || child.parentId !== folder.id) {
        throw new Error(
          browser.i18n.getMessage('Error011', JSON.stringify(item))
        )
      }
    })
    folder.children.forEach(child => {
      let item = order.find((item) => item.type === child.type && item.id === child.id)
      if (!item) {
        throw new Error(
          browser.i18n.getMessage('Error012', JSON.stringify(item))
        )
      }
    })
    if (order.length !== folder.children.length) {
      const diff = difference(folder.children.map(i => i.id), order.map(i => i.id))
      throw new Error(browser.i18n.getMessage('Error012') + ' ' + JSON.stringify(diff))
    }
    const newChildren = []
    order.forEach(item => {
      let child = folder.findItem(item.type, item.id)
      newChildren.push(child)
    })
    folder.children = newChildren
  }

  async removeFolder(folder) {
    Logger.log('REMOVEFOLDER', { folder })
    let id = folder.id
    const oldFolder = this.bookmarksCache.findFolder(id)
    if (!oldFolder) {
      throw new Error(browser.i18n.getMessage('Error013'))
    }
    // root folder doesn't have a parent, yo!
    const foundOldFolder = this.bookmarksCache.findFolder(oldFolder.parentId)
    if (!foundOldFolder) {
      throw new Error(browser.i18n.getMessage('Error014'))
    }
    foundOldFolder.children.splice(foundOldFolder.children.indexOf(oldFolder), 1)
    this.bookmarksCache.createIndex()
  }

  async bulkImportFolder(id, folder) {
    Logger.log('BULKIMPORT', { id, folder })
    const foundFolder = this.bookmarksCache.findFolder(id)
    if (!foundFolder) {
      throw new Error(browser.i18n.getMessage('Error005'))
    }
    // clone and adjust ids
    const imported = folder.clone()
    imported.id = id
    await imported.traverse(async(item, parentFolder) => {
      item.id = ++this.highestId
      item.parentId = parentFolder.id
    })
    // insert into tree
    foundFolder.children = imported.children
    // good as new
    this.bookmarksCache.createIndex()
    return imported
  }

  setData(data) {
    this.server = { ...data }
  }

  getData() {
    return { ...this.server }
  }
}
