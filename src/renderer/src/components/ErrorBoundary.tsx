import { Component, type ReactNode, type ErrorInfo } from 'react'
import { Center, Stack, Title, Text, Button, Code, Paper, ThemeIcon } from '@mantine/core'
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <Center h="100vh" style={{ background: 'var(--mantine-color-dark-8)' }}>
        <Stack align="center" gap="lg" maw={480} px="md">
          <ThemeIcon size={64} radius="xl" color="red" variant="light">
            <IconAlertTriangle size={32} />
          </ThemeIcon>
          <Stack gap="xs" align="center">
            <Title order={3}>Something went wrong</Title>
            <Text c="dimmed" ta="center" size="sm">
              An unexpected error crashed this view. Your data is safe — restart the app to recover.
            </Text>
          </Stack>
          <Paper p="md" withBorder w="100%" style={{ background: 'var(--mantine-color-dark-7)' }}>
            <Code block style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {this.state.error.message}
            </Code>
          </Paper>
          <Button
            leftSection={<IconRefresh size={14} />}
            onClick={() => this.setState({ error: null })}
          >
            Try Again
          </Button>
        </Stack>
      </Center>
    )
  }
}
