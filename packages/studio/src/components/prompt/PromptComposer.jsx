"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

const DEFAULT_POSITION_CLASS =
  "absolute bottom-4 w-full max-w-[95%] lg:max-w-4xl z-30 animate-fade-in-up";

const DEFAULT_PANEL_CLASS =
  "w-full bg-[#171719]/95 backdrop-blur-3xl rounded-[1.5rem] border border-white/[0.09] p-4 flex flex-col gap-3 shadow-[0_16px_48px_rgba(0,0,0,0.4),inset_0_0.5px_0_rgba(255,255,255,0.06)]";

const DEFAULT_TEXTAREA_CLASS =
  "w-full bg-transparent border-none text-white text-[15px] placeholder:text-white/30 focus:outline-none resize-none pt-1 leading-relaxed min-h-[40px] max-h-[150px] md:max-h-[250px] overflow-y-auto custom-scrollbar disabled:opacity-40";

const DEFAULT_ACTION_CLASS =
  "bg-[#EF0328] text-white px-7 py-3 rounded-full font-semibold text-sm hover:bg-[#FF2447] active:scale-[0.97] transition-[transform,background-color,box-shadow,opacity] duration-150 flex items-center justify-center gap-2 w-full sm:w-auto shadow-[0_4px_16px_rgba(239,3,40,0.35)] z-10 disabled:opacity-50 disabled:cursor-not-allowed";

const CONTROL_LAYOUT_CLASS =
  "h-[38px] flex items-center gap-2 rounded-lg transition-[transform,background-color,border-color,color] duration-150 border group whitespace-nowrap focus:outline-none focus-visible:border-white/15 focus-visible:ring-1 focus-visible:ring-[#EF0328]/30 active:scale-[0.97]";

const CONTROL_IDLE_CLASS =
  "text-white/85 bg-white/[0.06] hover:bg-white/[0.1] border-white/[0.06]";

const CONTROL_ACTIVE_CLASS =
  "text-white/80 bg-white/10 hover:bg-white/20 border-white/15";

const MEDIA_CONTROL_LAYOUT_CLASS =
  "w-10 h-10 shrink-0 rounded-full border transition-all flex items-center justify-center relative overflow-hidden group focus:outline-none focus-visible:border-white/15 focus-visible:ring-1 focus-visible:ring-[#EF0328]/30";

const DEFAULT_POPOVER_POSITION_CLASS =
  "absolute bottom-[calc(100%+12px)] left-0 z-50";

const DEFAULT_POPOVER_CLASS =
  "bg-[#1d1d1f]/[0.98] rounded-xl p-3.5 shadow-[0_16px_48px_rgba(0,0,0,0.65),inset_0_0.5px_0_rgba(255,255,255,0.08)] border border-white/[0.1] backdrop-blur-3xl min-w-[160px] max-h-[40vh] overflow-y-auto custom-scrollbar";

function joinClasses(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function promptControlClassName({
  active = false,
  compact = false,
  iconOnly = false,
  className = "",
} = {}) {
  return joinClasses(
    CONTROL_LAYOUT_CLASS,
    iconOnly
      ? "w-[38px] px-0 justify-center"
      : compact
        ? "px-3"
        : "px-4",
    active ? CONTROL_ACTIVE_CLASS : CONTROL_IDLE_CLASS,
    className,
  );
}

export function promptMediaButtonClassName({
  active = false,
  className = "",
} = {}) {
  return joinClasses(
    MEDIA_CONTROL_LAYOUT_CLASS,
    active
      ? "border-white/15 bg-white/10 hover:border-white/15"
      : "border-white/[0.03] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/15",
    className,
  );
}

export const PROMPT_MEDIA_PREVIEW_CLASS =
  "relative w-10 h-10 shrink-0 rounded-full border border-white/10 overflow-hidden shadow-md group";

export const PROMPT_CONTROL_LABEL_CLASS =
  "text-xs font-semibold text-current opacity-70 group-hover:text-white/80 group-hover:opacity-100 transition-all";

export function PromptChevronIcon({ className = "" }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={joinClasses(
        "text-current opacity-[0.45] group-hover:opacity-100 flex-shrink-0 transition-opacity",
        className,
      )}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function PromptAspectRatioIcon({ className = "" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={joinClasses("text-current opacity-[0.45] flex-shrink-0", className)}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
    </svg>
  );
}

export function PromptDurationIcon({ className = "" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={joinClasses("text-current opacity-[0.45] flex-shrink-0", className)}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function PromptQualityIcon({ className = "" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={joinClasses("text-current opacity-70 flex-shrink-0", className)}
      aria-hidden="true"
    >
      <path d="M6.5 3.5h11L22 9 12 21 2 9l4.5-5.5Z" />
      <path d="M2 9h20" />
      <path d="m6.5 3.5 3 5.5L12 21" />
      <path d="m17.5 3.5-3 5.5L12 21" />
    </svg>
  );
}

export const PromptPopover = forwardRef(function PromptPopover(
  {
    children,
    className = "",
    positionClassName = DEFAULT_POPOVER_POSITION_CLASS,
    ...props
  },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      className={joinClasses(
        positionClassName,
        DEFAULT_POPOVER_CLASS,
        className,
      )}
    >
      {children}
    </div>
  );
});

export function PromptPopoverHeader({ children, className = "" }) {
  return (
    <div
      className={joinClasses(
        "text-[11px] font-semibold text-white/30 uppercase tracking-wider pb-2 border-b border-white/[0.05] mb-2 px-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PromptMenuList({ children, className = "" }) {
  return (
    <div role="menu" className={joinClasses("flex flex-col gap-1", className)}>
      {children}
    </div>
  );
}

export function PromptMenuItem({
  children,
  description,
  selected = false,
  className = "",
  type = "button",
  ...props
}) {
  return (
    <button
      {...props}
      type={type}
      aria-checked={selected}
      role="menuitemradio"
      className={joinClasses(
        "w-full min-h-10 flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left cursor-pointer transition-all group/menu-item",
        "text-xs font-semibold text-white/70 hover:bg-white/20 hover:text-white/80 focus:outline-none focus-visible:bg-white/10 focus-visible:text-white/80",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block truncate">{children}</span>
        {description && (
          <span className="block text-[9px] font-medium text-white/35 mt-0.5 truncate group-hover/menu-item:text-white/50">
            {description}
          </span>
        )}
      </span>
      {selected && (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#EF0328"
          strokeWidth="4.5"
          className="flex-shrink-0"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}

export function PromptSegmentedControl({ children, className = "" }) {
  return (
    <div
      className={joinClasses(
        "inline-flex items-center gap-1 bg-white/[0.03] border border-white/[0.05] rounded-full p-0.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PromptSegmentOption({
  children,
  selected = false,
  className = "",
  type = "button",
  ...props
}) {
  return (
    <button
      {...props}
      type={type}
      aria-pressed={selected}
      className={joinClasses(
        "min-h-7 px-3 py-1 rounded-full text-xs font-semibold transition-all flex items-center justify-center gap-1.5",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-[#EF0328]/40",
        selected
          ? "bg-[#636366]/90 text-white shadow-sm"
          : "text-white/40 hover:text-white/70",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function PromptComposer({
  children,
  className = "",
  panelClassName = "",
  positionClassName = DEFAULT_POSITION_CLASS,
  style = { animationDelay: "0.2s" },
}) {
  return (
    <div className={joinClasses(positionClassName, className)} style={style}>
      <div className={joinClasses(DEFAULT_PANEL_CLASS, panelClassName)}>
        {children}
      </div>
    </div>
  );
}

export const PromptTextarea = forwardRef(function PromptTextarea(
  {
    value,
    onChange,
    onInput,
    className = "",
    maxHeightMobile = 150,
    maxHeightDesktop = 250,
    rows = 1,
    ...props
  },
  forwardedRef,
) {
  const internalRef = useRef(null);

  useImperativeHandle(forwardedRef, () => internalRef.current);

  const resize = useCallback(
    (element = internalRef.current) => {
      if (!element) return;

      element.style.height = "auto";
      const maxHeight =
        window.innerWidth < 768 ? maxHeightMobile : maxHeightDesktop;
      element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
    },
    [maxHeightDesktop, maxHeightMobile],
  );

  useEffect(() => {
    resize();
  }, [resize, value]);

  const handleChange = (event) => {
    onChange?.(event);
    resize(event.currentTarget);
  };

  const handleInput = (event) => {
    onInput?.(event);
    resize(event.currentTarget);
  };

  return (
    <textarea
      {...props}
      ref={internalRef}
      value={value}
      onChange={handleChange}
      onInput={handleInput}
      rows={rows}
      className={joinClasses(DEFAULT_TEXTAREA_CLASS, className)}
    />
  );
});

export function PromptFooter({ children, className = "" }) {
  return (
    <div
      className={joinClasses(
        "flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-3 border-t border-white/[0.03] relative",
        className,
      )}
    >
      {children}
    </div>
  );
}

export const PromptControls = forwardRef(function PromptControls(
  { children, className = "" },
  ref,
) {
  return (
    <div
      ref={ref}
      className={joinClasses(
        "flex items-center gap-2 relative flex-wrap pb-1 md:pb-0",
        className,
      )}
    >
      {children}
    </div>
  );
});

export const PromptAction = forwardRef(function PromptAction(
  { children, className = "", type = "button", ...props },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={joinClasses(DEFAULT_ACTION_CLASS, className)}
    >
      {children}
    </button>
  );
});
