# Responsive Layout Testing Guide

## Critical iPhone Models to Test

Test your app on these 3 device categories to cover 95% of edge cases:

### 1. **Small Screen (SE/Mini)**
- **Device**: iPhone SE (3rd gen)
- **Screen**: 4.7" (375 x 667 points)
- **Why**: Smallest modern iPhone - catches overflow and cramped layout issues

### 2. **Standard Screen (Regular)**
- **Device**: iPhone 15 or iPhone 14
- **Screen**: 6.1" (390 x 844 points)
- **Why**: Most common size - baseline for design

### 3. **Large Screen (Pro Max)**
- **Device**: iPhone 15 Pro Max
- **Screen**: 6.7" (430 x 932 points)
- **Why**: Largest screen - catches spacing and padding issues

## Quick Simulator Setup

```bash
# List all available simulators
xcrun simctl list devices available | grep iPhone

# Start Expo and switch devices in the simulator
npx expo start --ios
# Press 'i' to choose device, or Shift+i for device picker
```

## Device Switching Workflow

1. **In Simulator Menu**: `Hardware > Device > [Choose Model]`
2. **Keyboard Shortcut**: `Cmd + Shift + H` (Home) then relaunch
3. **Terminal**: Stop server (`Cmd + C`), then `npx expo start --ios` and select device

## Systematic Testing Checklist

### For Each Screen Test:
- [ ] **Top safe area**: No overlap with notch/Dynamic Island
- [ ] **Bottom safe area**: Buttons accessible above home indicator
- [ ] **Text overflow**: All text wraps properly, no cutoffs
- [ ] **Scroll behavior**: Content scrolls smoothly, no stuck areas
- [ ] **Modal positioning**: Modals center properly on all screens
- [ ] **Button spacing**: Buttons aren't too cramped or too spread out
- [ ] **Image scaling**: Images resize proportionally
- [ ] **Keyboard behavior**: TextInput visible when keyboard appears

### Screens to Test (Priority Order):
1. **Home/Index** (`app/index.tsx`) - Main entry point
2. **Flashcards** (`app/flashcards.tsx`) - Complex layout with modals
3. **Saved Flashcards** (`app/saved-flashcards.tsx`) - Horizontal scrolling
4. **Settings** (`app/settings.tsx`) - List with modals
5. **Profile** (`app/profile.tsx`) - Simple layout (quick test)

## Common Issues to Watch For

### 🔴 **Critical Issues**
- Text cut off or overlapping
- Buttons hidden off-screen
- Modals not centered
- Content unreachable due to keyboard

### 🟡 **Medium Priority**
- Excessive padding on large screens
- Cramped spacing on small screens
- Image aspect ratio issues
- Horizontal scroll when shouldn't exist

### 🟢 **Nice to Have**
- Consistent spacing across all devices
- Optimized font sizes per device
- Visual balance maintained

## Testing Rotation (Optional)

While your app locks to portrait, test landscape briefly to ensure the lock works:
```typescript
// Already in app/_layout.tsx:
ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
```

## Automation Option (Advanced)

Create a test script to capture screenshots automatically:
```bash
# Install screenshot tool
npm install --save-dev expo-screenshots

# Run on all devices
npm run test:screenshots
```

## Performance Testing

On each device, check:
- **Animation smoothness**: 60fps light animations
- **List scrolling**: No lag in flashcard lists
- **Modal transitions**: Smooth open/close
- **Image loading**: Fast cached images

---

## Quick Reference: Device Screen Specifications

| Model | Screen Size | Points | Safe Area Insets (approx) |
|-------|-------------|--------|---------------------------|
| iPhone SE | 4.7" | 375×667 | Top: 20pt, Bottom: 0pt |
| iPhone 15 | 6.1" | 390×844 | Top: 47pt, Bottom: 34pt |
| iPhone 15 Pro Max | 6.7" | 430×932 | Top: 59pt, Bottom: 34pt |

Safe area insets vary based on notch/Dynamic Island presence.

