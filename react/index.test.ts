import '@testing-library/jest-dom/extend-expect'
import { createElement as h, FC, useState } from 'react'
import { render, screen, act } from '@testing-library/react'
import { Client } from '@logux/client'
import { delay } from 'nanodelay'

import { Store, Model, loading, loaded, emitter, destroy } from '../index.js'
import { useStore, ClientContext } from './index.js'

function buildClient (): Client {
  return { objects: new Map() } as any
}

function emitChange (model: any) {
  model[emitter].emit('change', model)
}

class TestStore extends Store {
  value: string = 'a'

  changeValue (value: string) {
    this.value = value
    this[emitter].emit('change', this)
  }
}

it('throws on missed context', () => {
  let error: Error | undefined
  let Component: FC = () => {
    error = undefined
    try {
      // @ts-expect-error
      useStore(TestStore, '10')
    } catch (e) {
      error = e
    }
    return null
  }

  render(h(Component))
  expect(error?.message).toContain('ClientContext.Provider')

  let client = buildClient()
  render(h(ClientContext.Provider, { value: client }, h(Component)))
  expect(error?.message).toEqual('TestStore doesn’t use model ID')
})

it('renders and update store', async () => {
  let client = buildClient()
  let renders = 0

  let Component: FC = () => {
    renders += 1
    let test = useStore(TestStore)
    return h('div', { 'data-testid': 'test' }, test.value)
  }

  let Wrapper: FC = () => {
    let [show, setShow] = useState<boolean>(true)
    return h(
      'div',
      {},
      h('button', { onClick: () => setShow(false) }),
      show && h(Component)
    )
  }

  render(h(ClientContext.Provider, { value: client }, h(Wrapper)))
  expect(screen.getByTestId('test')).toHaveTextContent('a')
  expect(renders).toEqual(1)

  let store = client.objects.get(TestStore) as TestStore
  act(() => {
    store.changeValue('b')
  })

  expect(screen.getByTestId('test')).toHaveTextContent('b')
  expect(renders).toEqual(2)

  act(() => {
    screen.getByRole('button').click()
  })
  expect(screen.queryByTestId('test')).not.toBeInTheDocument()
  expect(renders).toEqual(2)
  await delay(20)
  expect(client.objects.has(TestStore)).toBe(false)
})

it('renders and update models', async () => {
  let destroyed = 0
  class TestModel extends Model {
    [destroy] () {
      destroyed += 1
    }
  }

  let client = buildClient()
  let renders = 0

  let Component: FC<{ id: string }> = ({ id }) => {
    renders += 1
    let test = useStore(TestModel, id)
    return h('div', { 'data-testid': 'test' }, test.id)
  }

  let Wrapper: FC = () => {
    let [number, inc] = useState<number>(1)
    return h(
      'div',
      {},
      h('button', { onClick: () => inc(2) }),
      h(Component, { id: `test:${number}` })
    )
  }

  render(h(ClientContext.Provider, { value: client }, h(Wrapper)))
  expect(screen.getByTestId('test')).toHaveTextContent('test:1')
  expect(renders).toEqual(1)

  act(() => {
    screen.getByRole('button').click()
  })
  expect(screen.getByTestId('test')).toHaveTextContent('test:2')
  expect(renders).toEqual(2)
  expect(client.objects.has('test:1')).toBe(true)
  expect(client.objects.has('test:2')).toBe(true)
  expect(destroyed).toEqual(0)

  await delay(20)
  expect(client.objects.has('test:1')).toBe(false)
  expect(client.objects.has('test:2')).toBe(true)
  expect(destroyed).toEqual(1)
})

it('renders loading models', async () => {
  class TestModel extends Model {
    [loading]: Promise<void>;
    [loaded] = false
    resolve = () => {}

    constructor (c: Client, id: string) {
      super(c, id)
      this[loading] = new Promise(resolve => {
        this.resolve = resolve
      })
    }
  }

  let client = buildClient()
  let renders = 0

  let Component: FC = () => {
    renders += 1
    let [isLoading, model] = useStore(TestModel, 'test:1')
    return h('div', { 'data-testid': 'test' }, isLoading ? 'loading' : model.id)
  }

  render(h(ClientContext.Provider, { value: client }, h(Component)))
  expect(screen.getByTestId('test')).toHaveTextContent('loading')
  expect(renders).toEqual(1)

  let model = client.objects.get('test:1') as TestModel

  act(() => {
    emitChange(model)
  })
  expect(renders).toEqual(1)

  await act(async () => {
    model.resolve()
    await delay(1)
  })
  expect(screen.getByTestId('test')).toHaveTextContent('test:1')
  expect(renders).toEqual(2)

  act(() => {
    emitChange(model)
  })
  expect(renders).toEqual(3)
})

it('does not reload store on component changes', async () => {
  let destroyed = 0
  class TestModel extends Model {
    [destroy] () {
      destroyed += 1
    }
  }

  let client = buildClient()

  let ComponentA: FC = () => {
    let test = useStore(TestModel, '10')
    return h('div', { 'data-testid': 'test' }, 'Model: ' + test.id)
  }

  let ComponentB: FC = () => {
    let test = useStore(TestModel, '10')
    return h('div', { 'data-testid': 'test' }, 'ID: ' + test.id)
  }

  let Switcher: FC = () => {
    let [state, setState] = useState<'a' | 'b' | 'none'>('a')
    if (state === 'a') {
      return h(
        'div',
        {},
        h('button', { onClick: () => setState('b') }),
        h(ComponentA)
      )
    } else if (state === 'b') {
      return h(
        'div',
        {},
        h('button', { onClick: () => setState('none') }),
        h(ComponentB)
      )
    } else {
      return null
    }
  }

  render(h(ClientContext.Provider, { value: client }, h(Switcher)))
  expect(screen.getByTestId('test')).toHaveTextContent('Model: 10')

  act(() => {
    screen.getByRole('button').click()
  })
  expect(screen.getByTestId('test')).toHaveTextContent('ID: 10')
  expect(destroyed).toEqual(0)

  act(() => {
    screen.getByRole('button').click()
  })
  expect(screen.queryByTestId('test')).not.toBeInTheDocument()
  expect(destroyed).toEqual(0)

  await delay(20)
  expect(destroyed).toEqual(1)
})
