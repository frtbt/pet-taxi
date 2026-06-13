import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import JobAlertOverlay from '../../src/components/JobAlertOverlay';
import Colors from '../../src/theme/colors';

const OWNER_TABS = [
    { name: 'index',   title: 'Ana Sayfa',    icon: 'home'          },
    { name: 'pool',    title: 'Talepler',     icon: 'car'           },
    { name: 'dogs',    title: 'Köpeklerim',   icon: 'paw'           },
    { name: 'wallet',  title: 'Cüzdan',       icon: 'wallet'        },
    { name: 'profile', title: 'Profil',       icon: 'person-circle' },
];

const DRIVER_TABS = [
    { name: 'index',   title: 'Ana Sayfa',    icon: 'home'          },
    { name: 'pool',    title: 'İş Havuzu',    icon: 'search'        },
    { name: 'my-jobs', title: 'İşlerim',      icon: 'briefcase'     },
    { name: 'wallet',  title: 'Cüzdan',       icon: 'wallet'        },
    { name: 'profile', title: 'Profil',       icon: 'person-circle' },
];

const ALL_TAB_NAMES = ['index', 'pool', 'dogs', 'my-jobs', 'wallet', 'profile'];

export default function TabsLayout() {
    const { isDriver } = useAuth();
    const activeTabs   = isDriver ? DRIVER_TABS : OWNER_TABS;
    const activeNames  = activeTabs.map(t => t.name);

    return (
        <>
            <Tabs
                screenOptions={{
                    headerStyle:             { backgroundColor: Colors.card },
                    headerTintColor:         Colors.primary,
                    headerTitleStyle:        { fontWeight: 'bold', color: Colors.text },
                    tabBarActiveTintColor:   Colors.primary,
                    tabBarInactiveTintColor: Colors.textMuted,
                    tabBarStyle: {
                        backgroundColor: Colors.card,
                        borderTopColor:  Colors.border,
                        borderTopWidth:  1,
                        height:          72,
                        paddingBottom:   12,
                        paddingTop:      8,
                        elevation:       12,
                        shadowColor:     '#000',
                        shadowOpacity:   0.12,
                        shadowRadius:    12,
                        shadowOffset:    { width: 0, height: -3 },
                    },
                    tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
                }}
            >
                {ALL_TAB_NAMES.map(name => {
                    const tabCfg   = activeTabs.find(t => t.name === name);
                    const isActive = activeNames.includes(name);

                    return (
                        <Tabs.Screen
                            key={name}
                            name={name}
                            options={{
                                title:    tabCfg?.title ?? name,
                                href:     isActive ? undefined : null,
                                tabBarIcon: tabCfg
                                    ? ({ color, size, focused }) => (
                                        <Ionicons
                                            name={focused ? tabCfg.icon : `${tabCfg.icon}-outline`}
                                            size={size + 1}
                                            color={color}
                                        />
                                    )
                                    : undefined,
                            }}
                        />
                    );
                })}
            </Tabs>

            {/* Sürücüler için gerçek zamanlı talep bildirimi */}
            <JobAlertOverlay />
        </>
    );
}
