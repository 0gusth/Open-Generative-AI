"use client";

import { useState, useEffect } from 'react';
import { CreativeCanvas } from 'design-agent';

import { getUserBalance } from '../muapi';

export default function DesignAgentStudio({
  apiKey,
  userEmail,
  balance,
  isHeaderVisible,
  onToggleHeader,
  onGenerationStart,
  onGenerationEnd,
  onGenerationComplete,
  onGenerationError,
}) {
  const [userData, setUserData] = useState(null);

  // CreativeCanvas reads these storage keys in its own mount effects, so they must be
  // written before it first mounts. The write lives in an effect (never in the render
  // body — StrictMode double-renders would duplicate the side effect); mounting the
  // canvas is deferred below until this effect has committed the keys.
  const [storageReady, setStorageReady] = useState(false);
  useEffect(() => {
    if (apiKey) {
      sessionStorage.setItem("fromDesignAgent", "true");
      localStorage.setItem("token", apiKey);
    }
    setStorageReady(true);
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey) return;

    // White-label shells already know the end user's identity/credit balance (fetched via
    // /api/whitelabel/balance) and pass them in directly — GET /account/balance explicitly
    // 403s for white-label end users, so getUserBalance() below must stay BYOK-only.
    if (userEmail !== undefined || balance !== undefined) {
      setUserData({
        username: userEmail?.split('@')[0] || 'Studio User',
        email: userEmail,
        balance: balance || 0,
      });
      return;
    }

    const fetchUser = async () => {
      try {
        const data = await getUserBalance(apiKey);
        setUserData({
          username: data.email?.split('@')[0] || 'Studio User',
          email: data.email,
          balance: data.balance || 0
        });
      } catch (err) {
        console.error('Failed to fetch user data for Design Agent:', err);
      }
    };

    fetchUser();
  }, [apiKey, userEmail, balance]);

  // Hold the canvas back for one commit so the token is in storage before its
  // mount effects fire their first authenticated fetches.
  if (!storageReady) {
    return <div className="h-full w-full bg-black design-agent-studio" />;
  }

  return (
    <div className="h-full w-full bg-black overflow-hidden design-agent-studio">
      <CreativeCanvas
        user={userData}
        isAuthorized={!!userData}
        creditConversionRate={200}
        theme="dark"
        onToggleHeader={onToggleHeader}
        isHeaderVisible={isHeaderVisible}
        onGenerationStart={onGenerationStart}
        onGenerationEnd={onGenerationEnd}
        onGenerationComplete={onGenerationComplete}
        onGenerationError={onGenerationError}
      />
    </div>
  );
}
