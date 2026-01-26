import {
  useState,
  useEffect,
  useCallback,
  Dispatch,
  SetStateAction,
} from "react";

/**
 * Enhanced localStorage hook with better synchronization and type safety
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, Dispatch<SetStateAction<T>>, () => void] {
  // State to store our value
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Error loading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Return a wrapped version of useState's setter function that
  // persists the new value to localStorage.
  const setValue: Dispatch<SetStateAction<T>> = useCallback(
    (value: SetStateAction<T>) => {
      try {
        // Allow value to be a function so we have same API as useState
        const valueToStore =
          value instanceof Function ? value(storedValue) : value;

        // Save state
        setStoredValue(valueToStore);

        // Save to local storage
        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));

          // Dispatch custom event for cross-tab synchronization
          window.dispatchEvent(
            new CustomEvent("localStorage-update", {
              detail: { key, value: valueToStore },
            }),
          );
        }
      } catch (error) {
        console.warn(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key, storedValue],
  );

  // Remove item from localStorage
  const removeValue = useCallback(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(key);
        setStoredValue(initialValue);

        window.dispatchEvent(
          new CustomEvent("localStorage-update", {
            detail: { key, value: null },
          }),
        );
      }
    } catch (error) {
      console.warn(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, initialValue]);

  // Listen for changes in other tabs/windows
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent | CustomEvent) => {
      if (e instanceof StorageEvent) {
        if (e.key === key && e.newValue !== null) {
          try {
            setStoredValue(JSON.parse(e.newValue));
          } catch (error) {
            console.warn(
              `Error parsing localStorage value for "${key}":`,
              error,
            );
          }
        }
      } else if (e.type === "localStorage-update") {
        const detail = (e as CustomEvent).detail;
        if (detail.key === key) {
          setStoredValue(detail.value ?? initialValue);
        }
      }
    };

    window.addEventListener("storage", handleStorageChange as EventListener);
    window.addEventListener(
      "localStorage-update",
      handleStorageChange as EventListener,
    );

    return () => {
      window.removeEventListener(
        "storage",
        handleStorageChange as EventListener,
      );
      window.removeEventListener(
        "localStorage-update",
        handleStorageChange as EventListener,
      );
    };
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
}

/**
 * Hook for synchronized state across components without localStorage persistence
 */
export function useSyncedState<T>(
  key: string,
  initialValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initialValue);

  const setSyncedValue: Dispatch<SetStateAction<T>> = useCallback(
    (newValue: SetStateAction<T>) => {
      const valueToStore =
        newValue instanceof Function ? newValue(value) : newValue;

      setValue(valueToStore);

      // Dispatch custom event for cross-component synchronization
      window.dispatchEvent(
        new CustomEvent(`synced-state-${key}`, {
          detail: { value: valueToStore },
        }),
      );
    },
    [key, value],
  );

  useEffect(() => {
    const handleSync = (e: CustomEvent) => {
      setValue(e.detail.value);
    };

    window.addEventListener(`synced-state-${key}`, handleSync as EventListener);

    return () => {
      window.removeEventListener(
        `synced-state-${key}`,
        handleSync as EventListener,
      );
    };
  }, [key]);

  return [value, setSyncedValue];
}
