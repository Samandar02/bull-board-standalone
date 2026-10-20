import { useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { useHistory } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { useInstanceStore } from '../../hooks/useInstanceStore';
import { CheckIcon } from '../Icons/Check';
import { CloseIcon } from '../Icons/Close';
import { PencilIcon } from '../Icons/Pencil';
import s from './DatabaseSelector.module.css';

export const DatabaseSelector = () => {
  const history = useHistory();
  const api = useApi();
  const queryClient = useQueryClient();
  const { activeInstanceId, activeDb, setActiveDb } = useInstanceStore();

  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(String(activeDb));
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setVal(String(activeDb));
  }, [activeDb]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsEditing(false);
        setVal(String(activeDb));
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing, activeDb]);

  if (!activeInstanceId) {
    return null;
  }

  const handleConfirm = () => {
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 15) {
      if (parsed !== activeDb) {
        setActiveDb(parsed);
        api.setInstance(activeInstanceId, parsed);
        queryClient.invalidateQueries();
        history.push('/board');
      }
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setVal(String(activeDb));
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const parsedVal = parseInt(val, 10);
  const isValid = !isNaN(parsedVal) && parsedVal >= 0 && parsedVal <= 15;

  if (isEditing) {
    return (
      <div className={s.container} ref={containerRef}>
        <div className={s.editWrapper}>
          <input
            ref={inputRef}
            type="number"
            min="0"
            max="15"
            className={s.input}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className={s.btnGroup}>
            <button
              type="button"
              className={s.cancelBtn}
              onClick={handleCancel}
              title="Cancel (Esc)"
            >
              <CloseIcon className={s.icon} />
            </button>
            <button
              type="button"
              className={`${s.confirmBtn} ${!isValid ? s.disabled : ''}`}
              onClick={handleConfirm}
              disabled={!isValid}
              title="Confirm (Enter)"
            >
              <CheckIcon className={s.icon} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.container} ref={containerRef}>
      <button
        type="button"
        className={s.displayPill}
        onClick={() => setIsEditing(true)}
        title="Click to change Redis DB index (0-15)"
      >
        <span className={s.dbText}>db{activeDb}</span>
        <PencilIcon className={s.pencilIcon} />
      </button>
    </div>
  );
};
