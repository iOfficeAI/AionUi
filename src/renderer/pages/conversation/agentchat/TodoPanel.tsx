/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React, { useMemo } from 'react';
import { useAgentChat } from './AgentChatContext';
import styles from './agentchat.module.css';

const TodoPanel: React.FC = () => {
  const { todos, toggleTodo, removeTodo, todoPanelOpen, setTodoPanelOpen, getAgentColor } = useAgentChat();

  // Sort: open todos first, then done
  const sortedTodos = useMemo(() => {
    return [...todos].sort((a, b) => {
      if (a.status === 'todo' && b.status === 'done') return -1;
      if (a.status === 'done' && b.status === 'todo') return 1;
      return b.createdAt - a.createdAt;
    });
  }, [todos]);

  if (!todoPanelOpen) return null;

  return (
    <div className={styles.todosPanel}>
      <div className={styles.todosPanelHeader}>
        <span>Todos</span>
        <button type='button' className={styles.todosClose} onClick={() => setTodoPanelOpen(false)}>
          &times;
        </button>
      </div>
      {sortedTodos.length === 0 ? (
        <div className={styles.todosEmpty}>No pinned items yet. Click &quot;Pin&quot; on any message to add it here.</div>
      ) : (
        sortedTodos.map((todo) => (
          <div key={todo.id} className={classNames(styles.todoItem, { [styles.todoItemDone]: todo.status === 'done' })}>
            <button type='button' className={classNames(styles.todoCheck, { [styles.todoCheckDone]: todo.status === 'done' })} onClick={() => toggleTodo(todo.id)} title={todo.status === 'todo' ? 'Mark done' : 'Mark open'}>
              {todo.status === 'done' ? '✓' : '○'}
            </button>
            <span className={styles.todoSender} style={{ color: getAgentColor(todo.sender) }}>
              {todo.sender}
            </span>
            <span className={styles.todoText}>{todo.text}</span>
            <button type='button' className={styles.todoRemove} onClick={() => removeTodo(todo.id)} title='Remove'>
              &times;
            </button>
          </div>
        ))
      )}
    </div>
  );
};

export default TodoPanel;
