import { Center, Stack, Title, Text, ThemeIcon } from '@mantine/core'
import { IconDatabase } from '@tabler/icons-react'

export default function WelcomePage() {
  return (
    <Center h="100vh">
      <Stack align="center" gap="md">
        <ThemeIcon size={72} radius="xl" variant="light" color="indigo">
          <IconDatabase size={40} />
        </ThemeIcon>
        <Title order={2} c="dimmed">DB Warden</Title>
        <Text c="dimmed" ta="center" maw={380}>
          Add a database connection from the sidebar to manage users, roles and privileges.
          Your credentials are encrypted and stored locally — nothing leaves your machine.
        </Text>
      </Stack>
    </Center>
  )
}
