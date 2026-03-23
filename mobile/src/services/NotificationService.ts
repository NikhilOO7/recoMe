import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export class NotificationService {
  private static instance: NotificationService;
  private expoPushToken: string | null = null;

  private constructor() {}

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async init(): Promise<void> {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    this.expoPushToken = tokenData.data;
  }

  getToken(): string | null {
    return this.expoPushToken;
  }

  async scheduleLocal(title: string, body: string, seconds: number = 0): Promise<string> {
    return Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger:
        seconds > 0
          ? { seconds, type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL }
          : null,
    });
  }

  onNotificationReceived(
    handler: (notification: Notifications.Notification) => void,
  ): Notifications.EventSubscription {
    return Notifications.addNotificationReceivedListener(handler);
  }

  onNotificationResponse(
    handler: (response: Notifications.NotificationResponse) => void,
  ): Notifications.EventSubscription {
    return Notifications.addNotificationResponseReceivedListener(handler);
  }
}
