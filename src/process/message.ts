/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chatLib';
import { composeMessage } from '@/common/chatLib';
import { ProcessChatMessage } from './initStorage';

let addStack = new Map<
  string,
  {
    type: 'add' | 'compose';
    message: TMessage | ((message?: TMessage[]) => TMessage[]);
  }[]
>();

const nextTickCallback: Array<() => void> = [];

const pushCacheMessage = (id: string, message: TMessage, type: 'add' | 'compose') => {
  const list = addStack.get(id) || [];
  addStack.set(id, list.concat({ type, message }));
};

const debounce = (fn: () => void) => {
  let timer: NodeJS.Timeout | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn();
      clearTimeout(timer);
      timer = null;
    }, 100);
  };
};

let isSyncing = false;
const syncToLocalFile = () => {
  if (isSyncing) return;
  isSyncing = true;
  const stack = addStack;
  addStack = new Map();
  const promiseList: Promise<any>[] = [];
  stack.forEach((list, id) => {
    const promise = ProcessChatMessage.get(id).then((messages) => {
      let newList = messages || [];
      for (let i = 0, len = list.length; i < len; i++) {
        const { type, message } = list[i];
        if (typeof message === 'function') {
          newList = message(newList);
          continue;
        }
        if (type === 'add') {
          newList = newList.concat(message);
        } else {
          newList = composeMessage(message, newList);
        }
      }
      return ProcessChatMessage.set(id, newList);
    });
    promiseList.push(promise);
  });
  Promise.all(promiseList)
    .then(() => {
      while (nextTickCallback.length) {
        nextTickCallback.shift()();
      }
    })
    .finally(() => {
      isSyncing = false;
      debounce(syncToLocalFile)();
    });
};
const nextTickSyncToLocalFile = debounce(syncToLocalFile);

export const addMessage = (conversation_id: string, message: TMessage) => {
  pushCacheMessage(conversation_id, message, 'add');
  nextTickSyncToLocalFile();
};

export const updateMessage = (conversation_id: string, message: (message: TMessage[]) => TMessage[]) => {
  const list = addStack.get(conversation_id) || [];
  addStack.set(conversation_id, list.concat({ type: 'compose', message }));
  nextTickSyncToLocalFile();
};

export const addOrUpdateMessage = (conversation_id: string, message: TMessage) => {
  pushCacheMessage(conversation_id, message, 'compose');
  nextTickSyncToLocalFile();
};

export const nextTickSync = (fn: () => void) => {
  nextTickCallback.push(fn);
  nextTickSyncToLocalFile();
};
