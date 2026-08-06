import { Children, forwardRef, isValidElement, type ComponentRef, type ReactNode } from "react";
import {
  Alert as NativeAlert,
  Platform,
  Pressable as NativePressable,
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type PressableProps,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from "react-native";
import { translateCurrentMobileText, useMobileLocale } from "../lib/mobile-locale";
import { presentAppDialog } from "./app-dialog-controller";

/**
 * iPadOS 26.5 + Fabric: measuring TextInput with the variable system font
 * (UIFont systemFontOfSize:weight: → CopyVariationAxes) can SIGSEGV. Force a
 * non-variable UIKit face and drop weight so layout never hits that path.
 */
const IOS_SAFE_TEXT_INPUT_STYLE: TextStyle = Platform.OS === "ios"
  ? {
      fontFamily: "Helvetica",
      fontWeight: "400",
    }
  : {};

const translateChildren = (children: ReactNode, translate: (value: string) => string): ReactNode =>
  Children.map(children, (child) => {
    if (typeof child === "string") {
      return translate(child);
    }
    // Keep numeric/boolean leaves as plain strings so Fabric's AttributedString
    // cache never receives mixed non-text host children under Text.
    if (typeof child === "number" || typeof child === "boolean") {
      return String(child);
    }
    if (isValidElement(child) && child.type === NativeText) {
      return child;
    }
    return child;
  });

export const Text = forwardRef<ComponentRef<typeof NativeText>, TextProps>(({ children, ...props }, ref) => {
  const { translate } = useMobileLocale();
  return (
    <NativeText allowFontScaling {...props} ref={ref}>
      {translateChildren(children, translate)}
    </NativeText>
  );
});

Text.displayName = "LocalizedText";

export const TextInput = forwardRef<ComponentRef<typeof NativeTextInput>, TextInputProps>(({ accessibilityHint, accessibilityLabel, placeholder, value, defaultValue, style, ...props }, ref) => {
  const { translate } = useMobileLocale();
  // Fabric TextInput measure on iPadOS 26.5 corrupts when value is non-string.
  const safeValue = value === undefined || value === null ? value : String(value);
  const safeDefault = defaultValue === undefined || defaultValue === null ? defaultValue : String(defaultValue);
  return (
    <NativeTextInput
      {...props}
      accessibilityHint={typeof accessibilityHint === "string" ? translate(accessibilityHint) : accessibilityHint}
      accessibilityLabel={typeof accessibilityLabel === "string" ? translate(accessibilityLabel) : accessibilityLabel}
      defaultValue={safeDefault}
      placeholder={placeholder ? translate(placeholder) : placeholder}
      ref={ref}
      // Safe face last so callers cannot reintroduce variable system-font weights.
      style={style ? StyleSheet.flatten([style, IOS_SAFE_TEXT_INPUT_STYLE]) : IOS_SAFE_TEXT_INPUT_STYLE}
      value={safeValue}
    />
  );
});

TextInput.displayName = "LocalizedTextInput";

export const Pressable = forwardRef<ComponentRef<typeof NativePressable>, PressableProps>(
  ({ accessibilityHint, accessibilityLabel, ...props }, ref) => (
    <NativePressable
      {...props}
      accessibilityHint={typeof accessibilityHint === "string" ? translateCurrentMobileText(accessibilityHint) : accessibilityHint}
      accessibilityLabel={typeof accessibilityLabel === "string" ? translateCurrentMobileText(accessibilityLabel) : accessibilityLabel}
      ref={ref}
    />
  )
);

Pressable.displayName = "LocalizedPressable";

export const Alert = {
  alert: (...[title, message, buttons, options]: Parameters<typeof NativeAlert.alert>) => {
    const translatedTitle = translateCurrentMobileText(title);
    const translatedMessage = message ? translateCurrentMobileText(message) : message;
    const translatedButtons = buttons?.map((button) => ({
      ...button,
      text: button.text ? translateCurrentMobileText(button.text) : button.text,
    }));
    if (presentAppDialog({ title: translatedTitle, message: translatedMessage, buttons: translatedButtons, options })) {
      return;
    }
    NativeAlert.alert(translatedTitle, translatedMessage, translatedButtons, options);
  },
};
